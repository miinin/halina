import { get, off, onDisconnect, onValue, ref, remove, serverTimestamp, set, update, type Database } from 'firebase/database';
import {
  advance,
  answerKey,
  createGame,
  isPhaseComplete,
  isSuspicious,
  moderate,
  rematch as rematchGame,
  removePlayer,
  syncPlayers,
  stepKey,
  validateInput,
  type GameState,
  type PlanItem,
  type QuestionPack,
  type TimedInput,
  type Uid,
} from '@halina/engine';
import { serverClock } from '../lib/hooks.ts';
import { lobbyState, paths, reserveCode, ROOM_TTL_MS, type PlayerRow, type StateRow } from '../lib/room.ts';

export interface RawInput {
  value: unknown;
  at: number;
}

/** kun kaikki ovat vastanneet, odotetaan hetki ennen vaiheen vaihtoa */
const ALL_ANSWERED_GRACE_MS = 700;
const RESUME_MIN_MS = 5_000;

export interface FreeText {
  uid: Uid;
  text: string;
  flagged: boolean;
  hidden: boolean;
}

/** Mitä ison näytön näkymät tarvitsevat: toteutuu sekä Firebase-hostilla että demolla. */
export interface HostLike {
  readonly code: string;
  game: GameState | null;
  roster: Record<Uid, PlayerRow>;
  inputs: Record<Uid, RawInput>;
  state: StateRow | null;
  reviewed: Set<Uid>;
  error: string | null;
  now(): number;
  subscribe(fn: () => void): () => void;
  next(): Promise<void>;
  pause(minRemaining?: number): Promise<void>;
  resume(): Promise<void>;
  rematch(): Promise<void>;
  toLobby(): Promise<void>;
  kick(uid: Uid): Promise<void>;
  start(plan: PlanItem[], pack: QuestionPack, speed?: number): Promise<void>;
  freeTexts(): FreeText[];
  markReviewed(uid: Uid): void;
  hideText(uid: Uid): Promise<void>;
}

/**
 * Hostin ajosilmukka: hostin selain on pelin ainoa tuomari. Moottori (puhdas TS) laskee,
 * tämä luokka kirjoittaa tilan Firebaseen ja kuuntelee pelaajien syötteitä.
 */
export class HostController implements HostLike {
  game: GameState | null = null;
  roster: Record<Uid, PlayerRow> = {};
  inputs: Record<Uid, RawInput> = {};
  state: StateRow | null = null;
  pack: QuestionPack | null = null;
  hiddenTexts = new Set<Uid>();
  /** host on tarkistanut epäilyttävät tekstit tässä vaiheessa */
  reviewed = new Set<Uid>();
  error: string | null = null;

  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private inputUnsub: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private lastInputAt = 0;
  private feedbackSent: Record<Uid, string> = {};
  private answeredSent = '';
  private clock;

  private constructor(
    readonly db: Database,
    readonly uid: string,
    readonly code: string,
  ) {
    this.clock = serverClock(db);
  }

  // ---------- luonti ja palautus ----------

  static async create(db: Database, uid: string): Promise<HostController> {
    const code = await reserveCode(db, uid);
    await set(ref(db, paths.room(code)), {
      meta: { hostUid: uid, status: 'lobby', createdAt: serverTimestamp(), hostConnected: true },
      state: lobbyState(),
    });
    await set(ref(db, paths.hostOnly(code)), { createdAt: serverTimestamp() });
    const c = new HostController(db, uid, code);
    c.attach();
    return c;
  }

  /** Jatkaa huonetta sivun päivityksen jälkeen. Peli palautetaan tauolle. */
  static async resume(db: Database, uid: string, code: string): Promise<HostController | null> {
    const owner = await get(ref(db, `${paths.code(code)}/hostUid`)).catch(() => null);
    if (!owner || owner.val() !== uid) return null;
    const [hostOnly, state] = await Promise.all([get(ref(db, paths.hostOnly(code))), get(ref(db, paths.state(code)))]);
    if (!hostOnly.exists()) return null;
    const c = new HostController(db, uid, code);
    const json = hostOnly.child('gameJson').val() as string | null;
    const packJson = hostOnly.child('packJson').val() as string | null;
    if (json) c.game = JSON.parse(json);
    if (packJson) c.pack = JSON.parse(packJson);
    c.state = state.val();
    c.attach();
    if (c.game && c.state && c.game.stage !== 'podium' && !c.state.paused && c.state.stepKey === stepKey(c.game)) {
      await c.pause(RESUME_MIN_MS);
    }
    return c;
  }

  /** Siivous: hostin omat yli 24 h vanhat huoneet */
  static async cleanup(db: Database, uid: string, codes: { code: string; createdAt: number }[]) {
    const now = Date.now();
    const keep: typeof codes = [];
    for (const c of codes) {
      if (now - c.createdAt < ROOM_TTL_MS) {
        keep.push(c);
        continue;
      }
      try {
        const owner = await get(ref(db, `${paths.code(c.code)}/hostUid`));
        if (owner.val() === uid) {
          await update(ref(db), { [paths.room(c.code)]: null, [paths.hostOnly(c.code)]: null });
          await remove(ref(db, paths.code(c.code)));
        }
      } catch {
        /* jo poistettu tai varattu muille */
      }
    }
    return keep;
  }

  private attach() {
    const metaPath = paths.meta(this.code);
    this.unsubs.push(
      onValue(ref(this.db, '.info/connected'), (snap) => {
        if (snap.val() !== true) return;
        onDisconnect(ref(this.db, `${metaPath}/hostConnected`))
          .set(false)
          .then(() => set(ref(this.db, `${metaPath}/hostConnected`), true))
          .catch(() => {});
      }),
    );
    this.unsubs.push(
      onValue(ref(this.db, paths.players(this.code)), (snap) => {
        this.roster = (snap.val() as Record<Uid, PlayerRow>) ?? {};
        if (this.game) {
          this.game = syncPlayers(
            this.game,
            Object.fromEntries(
              Object.entries(this.roster).map(([uid, r]) => [uid, { name: r.name, avatar: r.avatar, connected: r.connected !== false }]),
            ),
          );
        }
        this.emit();
      }),
    );
    this.unsubs.push(
      onValue(ref(this.db, paths.state(this.code)), (snap) => {
        this.state = snap.val();
        this.listenInputs();
        this.emit();
      }),
    );
    this.timer = setInterval(() => this.tick(), 200);
  }

  dispose() {
    this.unsubs.forEach((u) => u());
    this.inputUnsub?.();
    if (this.timer) clearInterval(this.timer);
    off(ref(this.db, paths.players(this.code)));
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((f) => f());
  }

  now() {
    return this.clock.now();
  }

  // ---------- syötteet ----------

  private listenedStep = '';

  private listenInputs() {
    const step = this.state?.stepKey ?? '';
    if (step === this.listenedStep) return;
    this.listenedStep = step;
    this.inputUnsub?.();
    this.inputs = {};
    this.feedbackSent = {};
    this.answeredSent = '';
    this.reviewed = new Set();
    this.hiddenTexts = new Set();
    if (!step || step === 'lobby' || !this.state?.input) return;
    this.inputUnsub = onValue(ref(this.db, paths.inputs(this.code, step)), (snap) => {
      if (this.state?.stepKey !== step) return;
      this.inputs = (snap.val() as Record<Uid, RawInput>) ?? {};
      this.lastInputAt = Date.now();
      void this.onInputs(step);
      this.emit();
    });
  }

  /** Moottori on toinen suoja: hylätyistä syötteistä palaute pelaajalle (esim. "Liian lähellä totuutta!") */
  private async onInputs(step: string) {
    const g = this.game;
    if (!g || stepKey(g) !== step) return;
    const updates: Record<string, unknown> = {};
    const answered: Record<Uid, true> = {};
    for (const [uid, inp] of Object.entries(this.inputs)) {
      const v = validateInput(g, uid, inp.value);
      const reason = v.ok ? '' : v.reason;
      if (v.ok) answered[uid] = true;
      if ((this.feedbackSent[uid] ?? '') !== reason) {
        this.feedbackSent[uid] = reason;
        updates[paths.feedback(this.code, uid)] = reason ? { stepKey: step, reason } : null;
      }
    }
    const key = Object.keys(answered).sort().join(',');
    if (key !== this.answeredSent) {
      this.answeredSent = key;
      updates[paths.progress(this.code)] = { stepKey: step, answered };
    }
    if (Object.keys(updates).length) await update(ref(this.db), updates).catch((e) => this.fail(e));
  }

  /** Vapaatekstit moderointia varten (Bluffi) */
  freeTexts(): FreeText[] {
    if (this.state?.input !== 'text') return [];
    return Object.entries(this.inputs)
      .filter(([, i]) => typeof i.value === 'string')
      .map(([uid, i]) => ({
        uid,
        text: String(i.value),
        flagged: isSuspicious(String(i.value)),
        hidden: this.hiddenTexts.has(uid),
      }));
  }

  private unreviewedFlags(): boolean {
    return this.freeTexts().some((f) => f.flagged && !f.hidden && !this.reviewed.has(f.uid));
  }

  markReviewed(uid: Uid) {
    this.reviewed.add(uid);
    this.emit();
  }

  // ---------- ajosilmukka ----------

  private tick() {
    const g = this.game;
    const s = this.state;
    if (!g || !s || this.busy || s.paused || g.stage === 'podium') return;
    if (s.stepKey !== stepKey(g)) return;
    const now = this.now();
    if (s.durationMs > 0 && now >= s.deadline) {
      void this.next();
      return;
    }
    if (s.input) {
      const raw = Object.fromEntries(Object.entries(this.inputs).map(([u, i]) => [u, i.value]));
      if (isPhaseComplete(g, raw) && Date.now() - this.lastInputAt > ALL_ANSWERED_GRACE_MS && !this.unreviewedFlags()) {
        void this.next();
      }
    }
  }

  private timedInputs(): Record<Uid, TimedInput> {
    const started = this.state?.startedAt ?? 0;
    const out: Record<Uid, TimedInput> = {};
    for (const [uid, inp] of Object.entries(this.inputs)) {
      out[uid] = { value: inp.value, ms: Math.max(0, (Number(inp.at) || started) - started) };
    }
    return out;
  }

  /** Päättää nykyisen vaiheen ja kirjoittaa seuraavan (myös "Ohita"). */
  async next() {
    if (!this.game || this.busy) return;
    this.busy = true;
    try {
      const g = advance(this.game, this.timedInputs());
      await this.write(g);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }

  private async write(g: GameState) {
    const phase = g.phase!;
    const now = this.now();
    const state: StateRow = {
      stepKey: stepKey(g),
      stage: g.stage,
      round: g.roundIndex,
      mode: g.plan[g.roundIndex]?.mode ?? null,
      phase: phase.name,
      input: phase.input,
      startedAt: now,
      deadline: phase.durationMs > 0 ? now + phase.durationMs : 0,
      durationMs: phase.durationMs,
      paused: false,
      remainingMs: 0,
      data: JSON.stringify({ view: phase.view, audience: phase.audience }),
    };
    const c = this.code;
    const updates: Record<string, unknown> = {
      [paths.state(c)]: state,
      [paths.progress(c)]: { stepKey: state.stepKey },
      [`rooms/${c}/inputs`]: null,
      [`rooms/${c}/feedback`]: null,
      [`${paths.meta(c)}/status`]: g.stage === 'podium' ? 'finished' : 'playing',
      [`${paths.hostOnly(c)}/gameJson`]: JSON.stringify(g),
      [`${paths.hostOnly(c)}/answerKey`]: { stepKey: state.stepKey, value: JSON.stringify(answerKey(g)) },
    };
    for (const p of Object.values(g.players)) {
      if (!this.roster[p.uid]) continue;
      updates[`${paths.player(c, p.uid)}/score`] = p.score;
      updates[`${paths.player(c, p.uid)}/alive`] = p.alive;
    }
    this.game = g;
    await update(ref(this.db), updates);
  }

  // ---------- hostin toiminnot ----------

  async start(plan: PlanItem[], pack: QuestionPack, speed = 1) {
    const players = Object.fromEntries(
      Object.entries(this.roster).map(([uid, r]) => [
        uid,
        { uid, name: r.name, avatar: r.avatar, score: 0, alive: true, connected: r.connected !== false },
      ]),
    );
    this.pack = pack;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
    this.game = createGame({ seed, plan, pack, players, speed });
    await set(ref(this.db, `${paths.hostOnly(this.code)}/packJson`), JSON.stringify(pack));
    await this.next();
  }

  async pause(minRemaining = 0) {
    const s = this.state;
    if (!s || s.paused || !this.game) return;
    const remaining = s.durationMs > 0 ? Math.max(s.deadline - this.now(), minRemaining) : 0;
    await update(ref(this.db, paths.state(this.code)), { paused: true, remainingMs: remaining });
  }

  async resume() {
    const s = this.state;
    if (!s || !s.paused) return;
    const now = this.now();
    const deadline = s.durationMs > 0 ? now + Math.max(s.remainingMs, 1500) : 0;
    // startedAt siirtyy tauon verran, jotta nopeuspisteet pysyvät reiluina
    const startedAt = s.durationMs > 0 ? deadline - s.durationMs : s.startedAt;
    await update(ref(this.db, paths.state(this.code)), { paused: false, remainingMs: 0, deadline, startedAt });
  }

  async kick(uid: Uid) {
    await update(ref(this.db), { [paths.kicked(this.code, uid)]: true, [paths.player(this.code, uid)]: null });
    if (this.game) this.game = removePlayer(this.game, uid);
  }

  /** Piilota asiaton vapaateksti – korvautuu talon valheella. */
  async hideText(uid: Uid) {
    if (!this.game) return;
    this.hiddenTexts.add(uid);
    this.reviewed.add(uid);
    const g = moderate(this.game, uid);
    this.game = g;
    const updates: Record<string, unknown> = { [`${paths.hostOnly(this.code)}/gameJson`]: JSON.stringify(g) };
    if (this.state && g.phase) {
      updates[`${paths.state(this.code)}/data`] = JSON.stringify({ view: g.phase.view, audience: g.phase.audience });
    }
    await update(ref(this.db), updates);
    this.emit();
  }

  async rematch() {
    if (!this.game || !this.pack) return;
    const players = Object.fromEntries(
      Object.entries(this.roster).map(([uid, r]) => [uid, { uid, name: r.name, avatar: r.avatar, score: 0, alive: true, connected: r.connected !== false }]),
    );
    const fresh = rematchGame({ ...this.game, players }, this.pack);
    this.game = fresh;
    await this.next();
  }

  async toLobby() {
    this.game = null;
    const updates: Record<string, unknown> = {
      [paths.state(this.code)]: lobbyState(),
      [paths.progress(this.code)]: null,
      [`rooms/${this.code}/inputs`]: null,
      [`${paths.meta(this.code)}/status`]: 'lobby',
      [`${paths.hostOnly(this.code)}/gameJson`]: null,
    };
    for (const uid of Object.keys(this.roster)) {
      updates[`${paths.player(this.code, uid)}/score`] = 0;
      updates[`${paths.player(this.code, uid)}/alive`] = true;
    }
    await update(ref(this.db), updates);
  }

  private fail(e: unknown) {
    console.error(e);
    this.error = e instanceof Error ? e.message : String(e);
    this.emit();
  }
}
