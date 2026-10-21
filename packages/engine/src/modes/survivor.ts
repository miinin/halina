import type { GameMode, Player, Rng, RoundContext, TimedInput, Uid } from '../types.ts';
import { mcPublic, prepareMc, validateMc, type PreparedMc } from '../mc.ts';
import { bump, isInt, speedPoints } from '../util.ts';

export const SURVIVOR_QUESTION_MS = 15_000;
export const SURVIVOR_REVEAL_MS = 5_000;
export const CELLAR_MS = 12_000;
export const CELLAR_MATH_MS = 15_000;
export const VERDICT_MS = 6_000;
export const SURVIVAL_BONUS = 1500;
export const GHOST_REVIVE_STREAK = 3;

export type ChallengeType = 'doors' | 'math' | 'sacrifice';

export interface MathProblem {
  text: string;
  answer: number;
}

export interface SurvivorResult {
  choice: number | null;
  correct: boolean;
  points: number;
  ghost: boolean;
}

export interface Verdict {
  challenge: ChallengeType;
  dead: Uid[];
  survivors: Uid[];
  /** säästetty, koska haaste olisi tappanut kaikki elävät */
  spared: Uid | null;
  trap?: number;
  doors?: Record<Uid, number>;
  problems?: MathProblem[];
  mathScores?: Record<Uid, { right: number; ms: number }>;
  votes?: Record<Uid, number>;
}

interface SurvivorState {
  qs: PreparedMc[];
  i: number;
  stage: 'start' | 'question' | 'reveal' | 'cellar' | 'verdict';
  ghostStreak: Record<Uid, number>;
  results: Record<Uid, SurvivorResult>;
  cellar: Uid[];
  revived: Uid[];
  challenge: ChallengeType | null;
  problems: MathProblem[];
  verdict: Verdict | null;
}

export function makeProblems(rng: Rng): MathProblem[] {
  const out: MathProblem[] = [];
  for (let k = 0; k < 3; k++) {
    const op = rng.int(3);
    if (op === 0) {
      const a = 10 + rng.int(80), b = 10 + rng.int(80);
      out.push({ text: `${a} + ${b}`, answer: a + b });
    } else if (op === 1) {
      const a = 40 + rng.int(60), b = 5 + rng.int(35);
      out.push({ text: `${a} − ${b}`, answer: a - b });
    } else {
      const a = 2 + rng.int(8), b = 3 + rng.int(9);
      out.push({ text: `${a} × ${b}`, answer: a * b });
    }
  }
  return out;
}

/** Kellarihaasteen tuomio. Elossa on aina vähintään yksi. */
export function judgeCellar(
  type: ChallengeType,
  cellar: Uid[],
  inputs: Record<Uid, TimedInput>,
  problems: MathProblem[],
  aliveOutside: number,
  rng: Rng,
): Verdict {
  let dead: Uid[] = [];
  /** paremmuusjärjestys (paras ensin) säästöä varten */
  let ranking: Uid[] = [];
  const v: Partial<Verdict> = {};

  if (type === 'doors') {
    const trap = rng.int(3);
    const doors: Record<Uid, number> = {};
    for (const uid of cellar) if (inputs[uid]) doors[uid] = inputs[uid].value as number;
    dead = cellar.filter((uid) => doors[uid] === undefined || doors[uid] === trap);
    ranking = [...cellar].sort((a, b) => (inputs[a]?.ms ?? Infinity) - (inputs[b]?.ms ?? Infinity));
    Object.assign(v, { trap, doors });
  } else if (type === 'math') {
    const mathScores: Record<Uid, { right: number; ms: number }> = {};
    for (const uid of cellar) {
      const ans = (inputs[uid]?.value as number[] | undefined) ?? [];
      const right = problems.filter((p, k) => ans[k] === p.answer).length;
      mathScores[uid] = { right, ms: inputs[uid]?.ms ?? Infinity };
    }
    const allRight = cellar.filter((uid) => mathScores[uid].right === problems.length);
    dead = cellar.filter((uid) => mathScores[uid].right < problems.length);
    if (allRight.length > 1) {
      const slowest = allRight.reduce((a, b) => (mathScores[b].ms > mathScores[a].ms ? b : a));
      dead.push(slowest);
    }
    ranking = [...cellar].sort(
      (a, b) => mathScores[b].right - mathScores[a].right || mathScores[a].ms - mathScores[b].ms,
    );
    Object.assign(v, { problems, mathScores });
  } else {
    const votes: Record<Uid, number> = {};
    for (const uid of cellar) votes[uid] = 0;
    for (const uid of cellar) {
      const target = inputs[uid]?.value as Uid | undefined;
      if (target && target in votes) votes[target]++;
    }
    const max = Math.max(...Object.values(votes));
    const tied = cellar.filter((uid) => votes[uid] === max);
    dead = [tied.length === 1 ? tied[0] : rng.pick(tied)];
    ranking = [...cellar].sort((a, b) => votes[a] - votes[b]);
    Object.assign(v, { votes });
  }

  let spared: Uid | null = null;
  if (aliveOutside === 0 && dead.length === cellar.length && cellar.length > 0) {
    spared = ranking[0];
    dead = dead.filter((uid) => uid !== spared);
  }
  return {
    challenge: type,
    dead,
    survivors: cellar.filter((uid) => !dead.includes(uid)),
    spared,
    ...v,
  };
}

function aliveCount(players: Record<Uid, Player>) {
  return Object.values(players).filter((p) => p.alive).length;
}

export const survivor: GameMode<SurvivorState> = {
  id: 'survivor',
  minPlayers: 3,
  needs: (count) => ({ classic: count, estimate: 0, bluff: 0 }),

  init: (ctx) => ({
    qs: ctx.questions.classic.slice(0, ctx.count).map((q) => prepareMc(q, ctx.rng)),
    i: -1,
    stage: 'start',
    ghostStreak: {},
    results: {},
    cellar: [],
    revived: [],
    challenge: null,
    problems: [],
    verdict: null,
  }),

  nextPhase(s, ctx: RoundContext) {
    const base = () => ({ index: s.i, total: s.qs.length });
    if (s.stage === 'question') {
      s.stage = 'reveal';
      return {
        name: 'reveal',
        durationMs: SURVIVOR_REVEAL_MS,
        input: null,
        audience: 'all',
        view: {
          kind: 'survivor-reveal',
          ...base(),
          ...mcPublic(s.qs[s.i]),
          correct: s.qs[s.i].correct,
          results: s.results,
          cellar: s.cellar,
          revived: s.revived,
        },
      };
    }
    if (s.stage === 'reveal' && s.cellar.length > 0) {
      s.stage = 'cellar';
      const types: ChallengeType[] = s.cellar.length >= 2 ? ['doors', 'math', 'sacrifice'] : ['doors', 'math'];
      s.challenge = ctx.rng.pick(types);
      s.problems = s.challenge === 'math' ? makeProblems(ctx.rng) : [];
      return {
        name: 'cellar',
        durationMs: s.challenge === 'math' ? CELLAR_MATH_MS : CELLAR_MS,
        input: s.challenge === 'doors' ? 'door' : s.challenge === 'math' ? 'math' : 'vote',
        audience: [...s.cellar],
        view: {
          kind: 'cellar',
          ...base(),
          challenge: s.challenge,
          cellar: s.cellar,
          problems: s.problems.map((p) => p.text),
        },
      };
    }
    if (s.stage === 'cellar') {
      s.stage = 'verdict';
      return {
        name: 'verdict',
        durationMs: VERDICT_MS,
        input: null,
        audience: 'all',
        view: { kind: 'cellar-verdict', ...base(), verdict: s.verdict },
      };
    }
    if (s.i + 1 >= s.qs.length) return 'round-end';
    s.i++;
    s.stage = 'question';
    s.results = {};
    s.cellar = [];
    s.revived = [];
    s.verdict = null;
    return {
      name: 'question',
      durationMs: SURVIVOR_QUESTION_MS,
      input: 'mc',
      audience: 'all',
      view: {
        kind: 'survivor-question',
        ...base(),
        ...mcPublic(s.qs[s.i]),
        ghosts: Object.values(ctx.players).filter((p) => !p.alive).map((p) => p.uid),
      },
    };
  },

  validateInput(s, phase, raw, p) {
    switch (phase.input) {
      case 'mc':
        return validateMc(s.qs[s.i], raw);
      case 'door':
        return isInt(raw) && raw >= 0 && raw <= 2 ? { ok: true, value: raw } : { ok: false, reason: 'invalid' };
      case 'math':
        return Array.isArray(raw) && raw.length === 3 && raw.every((x) => typeof x === 'number' && Number.isFinite(x))
          ? { ok: true, value: raw }
          : { ok: false, reason: 'invalid' };
      case 'vote':
        if (raw === p.uid) return { ok: false, reason: 'self-vote' };
        return typeof raw === 'string' && s.cellar.includes(raw)
          ? { ok: true, value: raw }
          : { ok: false, reason: 'invalid' };
      default:
        return { ok: false, reason: 'no-input' };
    }
  },

  resolve(s, phase, inputs, ctx) {
    const deltas: Record<Uid, number> = {};
    const patches: Record<Uid, { alive: boolean }> = {};
    if (phase.name === 'question') {
      const q = s.qs[s.i];
      for (const p of Object.values(ctx.players)) {
        const inp = inputs[p.uid];
        const choice = inp ? (inp.value as number) : null;
        const correct = choice === q.correct;
        let points = correct ? speedPoints(inp!.ms, phase.durationMs) : 0;
        if (p.alive) {
          if (!correct) s.cellar.push(p.uid);
        } else {
          // haamut: 50 % pisteistä, kolme oikeaa peräkkäin herättää henkiin
          points = Math.round(points / 2);
          s.ghostStreak[p.uid] = correct ? (s.ghostStreak[p.uid] ?? 0) + 1 : 0;
          if (s.ghostStreak[p.uid] >= GHOST_REVIVE_STREAK) {
            s.ghostStreak[p.uid] = 0;
            s.revived.push(p.uid);
            patches[p.uid] = { alive: true };
          }
        }
        if (points) deltas[p.uid] = points;
        s.results[p.uid] = { choice, correct, points, ghost: !p.alive };
      }
    } else if (phase.name === 'cellar' && s.challenge) {
      const aliveOutside = aliveCount(ctx.players) - s.cellar.length;
      s.verdict = judgeCellar(s.challenge, s.cellar, inputs, s.problems, aliveOutside, ctx.rng);
      for (const uid of s.verdict.dead) {
        patches[uid] = { alive: false };
        s.ghostStreak[uid] = 0;
      }
      for (const uid of s.verdict.survivors) bump(ctx.stats.cellarSurvived, uid);
    }
    return { deltas, patches };
  },

  finish(_s, ctx) {
    const deltas: Record<Uid, number> = {};
    for (const p of Object.values(ctx.players)) if (p.alive) deltas[p.uid] = SURVIVAL_BONUS;
    return { deltas };
  },

  answerKey(s, phase) {
    if (phase.input === 'mc') return s.qs[s.i].correct;
    if (phase.input === 'math') return s.problems.map((p) => p.answer);
    return null;
  },
};
