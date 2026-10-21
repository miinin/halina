import {
  advance,
  answerKey,
  botAnswer,
  createGame,
  inAudience,
  isPhaseComplete,
  isSuspicious,
  moderate,
  rematch as rematchGame,
  removePlayer,
  stepKey,
  validateInput,
  type GameState,
  type PlanItem,
  type QuestionPack,
  type TimedInput,
  type Uid,
} from '@halina/engine';
import type { FreeText, HostLike, RawInput } from '../host/controller.ts';
import { AVATAR_IDS, lobbyState, type PlayerRow, type StateRow } from '../lib/shared.ts';

export const ME = 'me';
const BOT_NAMES = ['Aino', 'Eetu', 'Siiri', 'Onni', 'Venla', 'Leevi', 'Helmi', 'Topi'];
const ALL_ANSWERED_GRACE_MS = 700;

/**
 * Selaindemo: sama pelimoottori ja samat näkymät kuin oikeassa pelissä, mutta Firebasen
 * tilalla on muistissa pyörivä tila ja muut pelaajat ovat botteja.
 */
export class DemoController implements HostLike {
  readonly code = 'DEMO';
  game: GameState | null = null;
  roster: Record<Uid, PlayerRow> = {};
  inputs: Record<Uid, RawInput> = {};
  state: StateRow | null = lobbyState();
  reviewed = new Set<Uid>();
  hiddenTexts = new Set<Uid>();
  error: string | null = null;
  pack: QuestionPack | null = null;

  private listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private loop: ReturnType<typeof setInterval>;
  private lastInputAt = 0;

  constructor(
    name: string,
    avatar: string,
    botCount: number,
    readonly accuracy = 0.55,
  ) {
    this.roster[ME] = { name, avatar, score: 0, alive: true, connected: true, joinedAt: 0 };
    const avatars = AVATAR_IDS.filter((a) => a !== avatar);
    for (let i = 0; i < botCount; i++) {
      this.roster[`bot${i}`] = {
        name: BOT_NAMES[i % BOT_NAMES.length],
        avatar: avatars[(i * 3) % avatars.length],
        score: 0,
        alive: true,
        connected: true,
        joinedAt: i + 1,
      };
    }
    this.loop = setInterval(() => this.tick(), 200);
  }

  dispose() {
    clearInterval(this.loop);
    this.clearTimers();
  }

  now() {
    return Date.now();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((f) => f());
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  // ---------- syötteet ----------

  /** Pelaajan (tai botin) vastaus – vastaa sääntöjä: vain nykyiseen vaiheeseen, ei tauolla, ei aikarajan jälkeen. */
  input(uid: Uid, value: unknown) {
    const s = this.state;
    if (!s?.input || s.paused || (s.deadline && this.now() > s.deadline + 1000)) return;
    this.inputs = { ...this.inputs, [uid]: { value, at: this.now() } };
    this.lastInputAt = Date.now();
    this.emit();
  }

  /** Hylätyn syötteen syy (esim. "too-close") – näytetään pelaajalle. */
  feedback(uid: Uid): string | null {
    const inp = this.inputs[uid];
    if (!inp || !this.game) return null;
    const v = validateInput(this.game, uid, inp.value);
    return v.ok ? null : v.reason;
  }

  private scheduleBots(g: GameState) {
    const phase = g.phase;
    if (!phase?.input) return;
    const step = stepKey(g);
    const key = answerKey(g);
    for (const p of Object.values(g.players)) {
      if (p.uid === ME || !inAudience(phase.audience, p)) continue;
      const delay = Math.min(700 + Math.random() * phase.durationMs * 0.55, Math.max(300, phase.durationMs - 1200));
      const fire = () => {
        if (this.state?.stepKey !== step || !this.game) return;
        if (this.state.paused) {
          this.timers.push(setTimeout(fire, 500));
          return;
        }
        const me = this.game.players[p.uid];
        if (!me) return;
        this.input(p.uid, botAnswer(phase.input!, phase.view, p.uid, me.score, key, this.accuracy));
      };
      this.timers.push(setTimeout(fire, delay));
    }
  }

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

  markReviewed(uid: Uid) {
    this.reviewed.add(uid);
    this.emit();
  }

  // ---------- ajosilmukka ----------

  private tick() {
    const g = this.game;
    const s = this.state;
    if (!g || !s || s.paused || g.stage === 'podium') return;
    if (s.durationMs > 0 && this.now() >= s.deadline) {
      void this.next();
      return;
    }
    if (s.input) {
      const raw = Object.fromEntries(Object.entries(this.inputs).map(([u, i]) => [u, i.value]));
      const flagged = this.freeTexts().some((f) => f.flagged && !f.hidden && !this.reviewed.has(f.uid));
      if (isPhaseComplete(g, raw) && Date.now() - this.lastInputAt > ALL_ANSWERED_GRACE_MS && !flagged) void this.next();
    }
  }

  async next() {
    if (!this.game) return;
    const started = this.state?.startedAt ?? 0;
    const timed: Record<Uid, TimedInput> = {};
    for (const [uid, inp] of Object.entries(this.inputs)) timed[uid] = { value: inp.value, ms: Math.max(0, inp.at - started) };
    try {
      this.write(advance(this.game, timed));
    } catch (e) {
      console.error(e);
      this.error = String(e);
      this.emit();
    }
  }

  private write(g: GameState) {
    this.clearTimers();
    const phase = g.phase!;
    const now = this.now();
    this.game = g;
    this.inputs = {};
    this.reviewed = new Set();
    this.hiddenTexts = new Set();
    this.state = {
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
    const roster = { ...this.roster };
    for (const p of Object.values(g.players)) {
      if (roster[p.uid]) roster[p.uid] = { ...roster[p.uid], score: p.score, alive: p.alive };
    }
    this.roster = roster;
    this.scheduleBots(g);
    this.emit();
  }

  // ---------- hostin toiminnot ----------

  private players() {
    return Object.fromEntries(
      Object.entries(this.roster).map(([uid, r]) => [uid, { uid, name: r.name, avatar: r.avatar, score: 0, alive: true, connected: true }]),
    );
  }

  async start(plan: PlanItem[], pack: QuestionPack, speed = 1) {
    this.pack = pack;
    this.game = createGame({ seed: (Math.random() * 2 ** 31) | 0, plan, pack, players: this.players(), speed });
    await this.next();
  }

  async pause() {
    const s = this.state;
    if (!s || s.paused || !this.game) return;
    this.state = { ...s, paused: true, remainingMs: s.durationMs > 0 ? Math.max(0, s.deadline - this.now()) : 0 };
    this.emit();
  }

  async resume() {
    const s = this.state;
    if (!s?.paused) return;
    const deadline = s.durationMs > 0 ? this.now() + Math.max(s.remainingMs, 1500) : 0;
    this.state = { ...s, paused: false, remainingMs: 0, deadline, startedAt: s.durationMs > 0 ? deadline - s.durationMs : s.startedAt };
    this.emit();
  }

  async kick(uid: Uid) {
    const { [uid]: _, ...rest } = this.roster;
    this.roster = rest;
    if (this.game) this.game = removePlayer(this.game, uid);
    this.emit();
  }

  async hideText(uid: Uid) {
    if (!this.game) return;
    this.hiddenTexts.add(uid);
    this.reviewed.add(uid);
    this.game = moderate(this.game, uid);
    if (this.state && this.game.phase) {
      this.state = { ...this.state, data: JSON.stringify({ view: this.game.phase.view, audience: this.game.phase.audience }) };
    }
    this.emit();
  }

  async rematch() {
    if (!this.game || !this.pack) return;
    this.game = rematchGame({ ...this.game, players: this.players() }, this.pack);
    await this.next();
  }

  async toLobby() {
    this.clearTimers();
    this.game = null;
    this.inputs = {};
    this.state = lobbyState();
    for (const uid of Object.keys(this.roster)) this.roster[uid] = { ...this.roster[uid], score: 0, alive: true };
    this.emit();
  }
}
