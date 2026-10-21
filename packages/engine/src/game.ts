import type {
  GameMode,
  GameStats,
  ModeId,
  PhaseSpec,
  PlanItem,
  Player,
  QuestionPack,
  QuestionSet,
  Resolution,
  RoundContext,
  TimedInput,
  Uid,
  Validation,
} from './types.ts';
import { classic } from './modes/classic.ts';
import { wager } from './modes/wager.ts';
import { bluff } from './modes/bluff.ts';
import { survivor } from './modes/survivor.ts';
import { estimate } from './modes/estimate.ts';
import { duel } from './modes/duel.ts';
import { audienceUids, createRng, inAudience } from './util.ts';

/** Kirjasto: uusi muoto lisätään tähän yhdellä rivillä. */
export const MODES: Record<ModeId, GameMode> = { classic, wager, bluff, survivor, estimate, duel };

export const INTRO_MS = 10_000;
export const SCOREBOARD_MS = 12_000;

export type Stage = 'lobby' | 'intro' | 'round' | 'scoreboard' | 'podium';

export interface GameState {
  version: 1;
  seed: number;
  rngState: number;
  /** ajastinkerroin (1 = normaali; dev/e2e voi nopeuttaa) */
  speed: number;
  plan: PlanItem[];
  questions: QuestionSet[];
  roundIndex: number;
  stage: Stage;
  modeState: unknown;
  phase: PhaseSpec | null;
  step: number;
  players: Record<Uid, Player>;
  stats: GameStats;
  skipped: number[];
}

export interface Award {
  id: 'most-fooled' | 'master-liar' | 'bravest' | 'cellar-king';
  uid: Uid;
  value: number;
}

export interface RankRow {
  uid: Uid;
  score: number;
  delta: number;
  rank: number;
}

export function emptyStats(): GameStats {
  return { streak: {}, fooled: {}, fooledOthers: {}, bravest: {}, cellarSurvived: {}, roundStartScores: {} };
}

export function stepKey(g: Pick<GameState, 'step'>): string {
  return `s${g.step}`;
}

function clone<T>(x: T): T {
  return structuredClone(x);
}

/** Arpoo jokaiselle kierrokselle omat kysymykset ilman toistoa. */
export function drawQuestions(plan: PlanItem[], pack: QuestionPack, rng: ReturnType<typeof createRng>, playerCount: number) {
  const pools = {
    classic: rng.shuffle(pack.classic),
    estimate: rng.shuffle(pack.estimate),
    bluff: rng.shuffle(pack.bluff),
  };
  const ptr = { classic: 0, estimate: 0, bluff: 0 };
  const take = <K extends keyof typeof pools>(k: K, n: number) => {
    const out = pools[k].slice(ptr[k], ptr[k] + n);
    ptr[k] += out.length;
    return out as (typeof pools)[K];
  };
  return plan.map((item) => {
    const need = MODES[item.mode].needs(item.count, playerCount);
    return {
      classic: take('classic', need.classic),
      estimate: take('estimate', need.estimate),
      bluff: take('bluff', need.bluff),
    } as QuestionSet;
  });
}

export function createGame(opts: {
  seed: number;
  plan: PlanItem[];
  pack: QuestionPack;
  players: Record<Uid, Player>;
  speed?: number;
}): GameState {
  const holder = { rngState: opts.seed | 0 };
  const rng = createRng(holder);
  const players: Record<Uid, Player> = {};
  for (const p of Object.values(opts.players)) players[p.uid] = { ...p, score: 0, alive: true };
  const questions = drawQuestions(opts.plan, opts.pack, rng, Object.keys(players).length);
  return {
    version: 1,
    seed: opts.seed,
    rngState: holder.rngState,
    speed: opts.speed ?? 1,
    plan: opts.plan,
    questions,
    roundIndex: -1,
    stage: 'lobby',
    modeState: null,
    phase: null,
    step: 0,
    players,
    stats: emptyStats(),
    skipped: [],
  };
}

function ctxOf(g: GameState): RoundContext {
  return {
    players: g.players,
    rng: createRng(g),
    stats: g.stats,
    options: g.plan[g.roundIndex]?.options ?? {},
    round: g.roundIndex,
  };
}

function applyResolution(g: GameState, res: Resolution) {
  for (const [uid, d] of Object.entries(res.deltas)) {
    const p = g.players[uid];
    if (p) p.score = Math.max(0, Math.round(p.score + d));
  }
  for (const [uid, patch] of Object.entries(res.patches ?? {})) {
    const p = g.players[uid];
    if (p) Object.assign(p, patch);
  }
}

export function currentMode(g: GameState): GameMode | null {
  const item = g.plan[g.roundIndex];
  return item ? MODES[item.mode] : null;
}

export function connectedCount(g: GameState): number {
  return Object.values(g.players).filter((p) => p.connected).length;
}

/** Pystyykö kierroksen pelaamaan nykyisellä porukalla ja kysymyksillä. */
function playable(g: GameState, idx: number): boolean {
  const item = g.plan[idx];
  const mode = MODES[item.mode];
  if (connectedCount(g) < mode.minPlayers) return false;
  const qs = g.questions[idx];
  const need = mode.needs(item.count, connectedCount(g));
  if (need.classic > 0 && qs.classic.length === 0) return false;
  if (need.estimate > 0 && qs.estimate.length === 0 && item.mode !== 'duel') return false;
  if (need.bluff > 0 && qs.bluff.length === 0) return false;
  return true;
}

export function ranking(g: GameState): RankRow[] {
  const rows = Object.values(g.players)
    .map((p) => ({ uid: p.uid, score: p.score, delta: p.score - (g.stats.roundStartScores[p.uid] ?? 0) }))
    .sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.score > r.score).length }));
}

export function awards(g: GameState): Award[] {
  const best = (rec: Record<Uid, number>, id: Award['id']): Award | null => {
    const top = Object.entries(rec)
      .filter(([uid, v]) => v > 0 && g.players[uid])
      .sort((a, b) => b[1] - a[1])[0];
    return top ? { id, uid: top[0], value: top[1] } : null;
  };
  return [
    best(g.stats.fooled, 'most-fooled'),
    best(g.stats.fooledOthers, 'master-liar'),
    best(g.stats.bravest, 'bravest'),
    best(g.stats.cellarSurvived, 'cellar-king'),
  ].filter((a): a is Award => a !== null);
}

function scaled(g: GameState, p: PhaseSpec): PhaseSpec {
  return { ...p, durationMs: Math.round(p.durationMs * g.speed) };
}

function introPhase(g: GameState): PhaseSpec {
  const item = g.plan[g.roundIndex];
  return {
    name: 'intro',
    durationMs: INTRO_MS,
    input: null,
    audience: 'all',
    view: {
      kind: 'intro',
      mode: item.mode,
      round: g.roundIndex,
      totalRounds: g.plan.length,
      final: g.roundIndex === g.plan.length - 1,
      options: item.options ?? {},
    },
  };
}

function nextPlayable(g: GameState, from: number): number {
  for (let i = from; i < g.plan.length; i++) {
    if (playable(g, i)) return i;
    g.skipped.push(i);
  }
  return -1;
}

function startRound(g: GameState, idx: number): PhaseSpec {
  if (idx < 0) {
    g.stage = 'podium';
    g.roundIndex = g.plan.length;
    return {
      name: 'podium',
      durationMs: 0,
      input: null,
      audience: 'all',
      view: { kind: 'podium', ranking: ranking(g), awards: awards(g) },
    };
  }
  g.roundIndex = idx;
  g.stage = 'intro';
  g.modeState = null;
  g.stats.roundStartScores = Object.fromEntries(Object.values(g.players).map((p) => [p.uid, p.score]));
  return introPhase(g);
}

function finishRound(g: GameState): PhaseSpec {
  const mode = currentMode(g)!;
  if (mode.finish) applyResolution(g, mode.finish(g.modeState, ctxOf(g)));
  for (const p of Object.values(g.players)) p.alive = true;
  const next = nextPlayable(g, g.roundIndex + 1);
  if (next < 0) return startRound(g, -1);
  g.stage = 'scoreboard';
  return {
    name: 'scoreboard',
    durationMs: SCOREBOARD_MS,
    input: null,
    audience: 'all',
    view: {
      kind: 'scoreboard',
      round: g.roundIndex,
      totalRounds: g.plan.length,
      ranking: ranking(g),
      nextMode: g.plan[next].mode,
      nextRound: next,
    },
  };
}

/** Tarkistaa yhden pelaajan syötteen nykyiseen vaiheeseen. */
export function validateInput(g: GameState, uid: Uid, raw: unknown): Validation {
  const p = g.players[uid];
  const phase = g.phase;
  if (!p || !phase || !phase.input || g.stage !== 'round') return { ok: false, reason: 'no-input' };
  if (!inAudience(phase.audience, p)) return { ok: false, reason: 'not-in-audience' };
  const mode = currentMode(g)!;
  return mode.validateInput(g.modeState, phase, raw, p, ctxOf(g));
}

/** Pelaajat, joiden vastausta odotetaan (yhdistetyt ja vaiheeseen osallistuvat). */
export function expectedResponders(g: GameState): Uid[] {
  if (!g.phase?.input || g.stage !== 'round') return [];
  const connected = Object.fromEntries(Object.entries(g.players).filter(([, p]) => p.connected));
  return audienceUids(g.phase.audience, connected);
}

export function isPhaseComplete(g: GameState, inputs: Record<Uid, unknown>): boolean {
  const expected = expectedResponders(g);
  if (!g.phase?.input) return false;
  return expected.length > 0 && expected.every((uid) => {
    const raw = inputs[uid];
    return raw !== undefined && validateInput(g, uid, raw).ok;
  });
}

/**
 * Päättää nykyisen vaiheen annetuilla syötteillä ja siirtyy seuraavaan.
 * Puhdas funktio: palauttaa uuden tilan, alkuperäinen säilyy.
 */
export function advance(game: GameState, inputs: Record<Uid, TimedInput> = {}): GameState {
  const g = clone(game);
  if (g.stage === 'podium') return g;

  if (g.stage === 'round' && g.phase) {
    const valid: Record<Uid, TimedInput> = {};
    if (g.phase.input) {
      for (const [uid, inp] of Object.entries(inputs)) {
        const v = validateInput(g, uid, inp.value);
        if (v.ok) valid[uid] = { value: v.value, ms: Math.max(0, inp.ms) };
      }
    }
    const res = currentMode(g)!.resolve(g.modeState, g.phase, valid, ctxOf(g));
    applyResolution(g, res);
  }

  let phase: PhaseSpec;
  switch (g.stage) {
    case 'lobby':
      phase = startRound(g, nextPlayable(g, 0));
      break;
    case 'scoreboard':
      phase = startRound(g, nextPlayable(g, g.roundIndex + 1));
      break;
    case 'intro': {
      const mode = currentMode(g)!;
      const item = g.plan[g.roundIndex];
      g.stage = 'round';
      g.modeState = mode.init({ ...ctxOf(g), questions: g.questions[g.roundIndex], count: item.count });
      const p = mode.nextPhase(g.modeState, ctxOf(g));
      phase = p === 'round-end' ? finishRound(g) : p;
      break;
    }
    case 'round': {
      const p = currentMode(g)!.nextPhase(g.modeState, ctxOf(g));
      phase = p === 'round-end' ? finishRound(g) : p;
      break;
    }
    default:
      throw new Error(`unknown stage ${g.stage}`);
  }
  g.phase = scaled(g, phase);
  g.step++;
  return g;
}

/** Hostin moderointi (esim. asiaton bluffi). Palauttaa uuden tilan. */
export function moderate(game: GameState, uid: Uid): GameState {
  const g = clone(game);
  const mode = currentMode(g);
  if (g.stage !== 'round' || !g.phase || !mode?.moderate) return g;
  const view = mode.moderate(g.modeState, g.phase, uid, ctxOf(g));
  if (view) g.phase = { ...g.phase, view };
  return g;
}

export function answerKey(g: GameState): unknown {
  const mode = currentMode(g);
  if (g.stage !== 'round' || !g.phase || !mode?.answerKey) return null;
  return mode.answerKey(g.modeState, g.phase) ?? null;
}

/** Liittyneet, nimen/avatarin muutokset ja yhteystila. Pisteet ja elossa-tila pysyvät moottorilla. */
export function syncPlayers(
  game: GameState,
  roster: Record<Uid, Pick<Player, 'name' | 'avatar' | 'connected'>>,
): GameState {
  const g = clone(game);
  for (const [uid, r] of Object.entries(roster)) {
    const p = g.players[uid];
    if (p) Object.assign(p, { name: r.name, avatar: r.avatar, connected: r.connected });
    else g.players[uid] = { uid, name: r.name, avatar: r.avatar, connected: r.connected, score: 0, alive: true };
  }
  for (const uid of Object.keys(g.players)) if (!(uid in roster)) g.players[uid].connected = false;
  return g;
}

export function removePlayer(game: GameState, uid: Uid): GameState {
  const g = clone(game);
  delete g.players[uid];
  return g;
}

/** "Pelaa uudestaan samalla porukalla" */
export function rematch(game: GameState, pack: QuestionPack, plan: PlanItem[] = game.plan, seed = game.seed + 1): GameState {
  return createGame({ seed, plan, pack, players: game.players, speed: game.speed });
}
