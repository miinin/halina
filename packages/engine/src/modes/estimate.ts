import type { EstimateQuestion, GameMode, Uid } from '../types.ts';

export const ESTIMATE_QUESTION_MS = 25_000;
export const ESTIMATE_REVEAL_MS = 9_000;
export const RANK_POINTS = [1000, 700, 500];
export const NEAR_POINTS = 200;
export const NEAR_LIMIT = 0.5;
export const EXACT_BONUS = 500;
const EPS = 1e-12;

export interface EstimateGuess {
  uid: Uid;
  guess: number;
  err: number;
  /** null = ei sijoitusta (Ylittämättä-variantissa yli mennyt) */
  rank: number | null;
  over: boolean;
  points: number;
}

/** |arvaus − oikea| / max(|oikea|, 1) */
export function relativeError(guess: number, answer: number): number {
  return Math.abs(guess - answer) / Math.max(Math.abs(answer), 1);
}

export function scoreEstimates(
  answer: number,
  guesses: { uid: Uid; guess: number }[],
  variant: 'closest' | 'under' = 'closest',
): EstimateGuess[] {
  const rows = guesses.map((g) => ({
    ...g,
    err: relativeError(g.guess, answer),
    over: g.guess > answer,
  }));
  const eligible = rows.filter((r) => variant === 'closest' || !r.over);
  return rows
    .map((r) => {
      if (variant === 'under' && r.over) return { ...r, rank: null, points: 0 };
      // sama virhe = sama sija
      const rank = 1 + eligible.filter((o) => o.err < r.err - EPS).length;
      let points = rank <= RANK_POINTS.length ? RANK_POINTS[rank - 1] : r.err <= NEAR_LIMIT + EPS ? NEAR_POINTS : 0;
      if (r.err < EPS) points += EXACT_BONUS;
      return { ...r, rank, points };
    })
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.err - b.err);
}

export function validateNumber(raw: unknown) {
  return typeof raw === 'number' && Number.isFinite(raw) && Math.abs(raw) < 1e15
    ? ({ ok: true, value: raw } as const)
    : ({ ok: false, reason: 'invalid' } as const);
}

interface EstimateState {
  qs: EstimateQuestion[];
  i: number;
  stage: 'start' | 'question' | 'reveal';
  variant: 'closest' | 'under';
  guesses: EstimateGuess[];
}

export const estimate: GameMode<EstimateState> = {
  id: 'estimate',
  minPlayers: 2,
  needs: (count) => ({ classic: 0, estimate: count, bluff: 0 }),

  init: (ctx) => ({
    qs: ctx.questions.estimate.slice(0, ctx.count),
    i: -1,
    stage: 'start',
    variant: ctx.options.estimateVariant ?? 'closest',
    guesses: [],
  }),

  nextPhase(s) {
    const q = () => s.qs[s.i];
    const base = () => ({
      index: s.i,
      total: s.qs.length,
      prompt: q().prompt,
      unit: q().unit ?? '',
      variant: s.variant,
    });
    if (s.stage === 'question') {
      s.stage = 'reveal';
      return {
        name: 'reveal',
        durationMs: ESTIMATE_REVEAL_MS,
        input: null,
        audience: 'all',
        view: { kind: 'estimate-reveal', ...base(), answer: q().answer, guesses: s.guesses },
      };
    }
    if (s.i + 1 >= s.qs.length) return 'round-end';
    s.i++;
    s.stage = 'question';
    s.guesses = [];
    return {
      name: 'question',
      durationMs: ESTIMATE_QUESTION_MS,
      input: 'number',
      audience: 'all',
      view: { kind: 'estimate-question', ...base() },
    };
  },

  validateInput: (_s, phase, raw) => (phase.input === 'number' ? validateNumber(raw) : { ok: false, reason: 'no-input' }),

  resolve(s, phase, inputs) {
    const deltas: Record<Uid, number> = {};
    if (phase.name !== 'question') return { deltas };
    s.guesses = scoreEstimates(
      s.qs[s.i].answer,
      Object.entries(inputs).map(([uid, inp]) => ({ uid, guess: inp.value as number })),
      s.variant,
    );
    for (const g of s.guesses) if (g.points) deltas[g.uid] = g.points;
    return { deltas };
  },

  answerKey: (s, phase) => (phase.input === 'number' ? s.qs[s.i].answer : null),
};
