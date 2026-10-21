import type { GameMode, Uid } from '../types.ts';
import { countChoices, mcPublic, prepareMc, validateMc, type PreparedMc } from '../mc.ts';
import { speedPoints } from '../util.ts';

export const CLASSIC_QUESTION_MS = 20_000;
export const CLASSIC_REVEAL_MS = 6_000;
export const STREAK_STEP = 100;
export const STREAK_MAX = 500;

export interface McResult {
  choice: number | null;
  correct: boolean;
  points: number;
  streak: number;
}

interface ClassicState {
  qs: PreparedMc[];
  i: number;
  stage: 'start' | 'question' | 'reveal';
  results: Record<Uid, McResult>;
}

/** Putkibonus: +100 jokaisesta peräkkäisestä oikeasta (ensimmäinen ei vielä bonusta), enintään +500. */
export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak - 1, 0) * STREAK_STEP, STREAK_MAX);
}

export const classic: GameMode<ClassicState> = {
  id: 'classic',
  minPlayers: 1,
  needs: (count) => ({ classic: count, estimate: 0, bluff: 0 }),

  init: (ctx) => ({
    qs: ctx.questions.classic.slice(0, ctx.count).map((q) => prepareMc(q, ctx.rng)),
    i: -1,
    stage: 'start',
    results: {},
  }),

  nextPhase(s) {
    if (s.stage === 'question') {
      s.stage = 'reveal';
      const q = s.qs[s.i];
      const values = Object.values(s.results).map((r) => r.choice);
      return {
        name: 'reveal',
        durationMs: CLASSIC_REVEAL_MS,
        input: null,
        audience: 'all',
        view: {
          kind: 'mc-reveal',
          index: s.i,
          total: s.qs.length,
          ...mcPublic(q),
          correct: q.correct,
          counts: countChoices(q, values),
          results: s.results,
        },
      };
    }
    if (s.i + 1 >= s.qs.length) return 'round-end';
    s.i++;
    s.stage = 'question';
    s.results = {};
    return {
      name: 'question',
      durationMs: CLASSIC_QUESTION_MS,
      input: 'mc',
      audience: 'all',
      view: { kind: 'mc-question', index: s.i, total: s.qs.length, ...mcPublic(s.qs[s.i]) },
    };
  },

  validateInput: (s, phase, raw) =>
    phase.input === 'mc' ? validateMc(s.qs[s.i], raw) : { ok: false, reason: 'no-input' },

  resolve(s, phase, inputs, ctx) {
    const deltas: Record<Uid, number> = {};
    if (phase.name !== 'question') return { deltas };
    const q = s.qs[s.i];
    for (const p of Object.values(ctx.players)) {
      const inp = inputs[p.uid];
      const choice = inp ? (inp.value as number) : null;
      const correct = choice === q.correct;
      const streak = correct ? (ctx.stats.streak[p.uid] ?? 0) + 1 : 0;
      ctx.stats.streak[p.uid] = streak;
      const points = correct ? speedPoints(inp!.ms, phase.durationMs) + streakBonus(streak) : 0;
      if (points) deltas[p.uid] = points;
      s.results[p.uid] = { choice, correct, points, streak };
    }
    return { deltas };
  },

  answerKey: (s, phase) => (phase.input === 'mc' ? s.qs[s.i].correct : null),
};
