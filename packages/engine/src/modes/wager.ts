import type { GameMode, Uid } from '../types.ts';
import { mcPublic, prepareMc, validateMc, type PreparedMc } from '../mc.ts';
import { isInt } from '../util.ts';

export const WAGER_CATEGORY_MS = 5_000;
export const WAGER_BET_MS = 15_000;
export const WAGER_QUESTION_MS = 20_000;
export const WAGER_REVEAL_MS = 8_000;
/** Alle tämän pisteen pelaaja voi panostaa pohjapanoksen, jonka voi vain voittaa. */
export const FLOOR_WAGER = 500;

export interface WagerResult {
  amount: number;
  floor: boolean;
  choice: number | null;
  correct: boolean;
  delta: number;
}

interface WagerState {
  qs: PreparedMc[];
  i: number;
  stage: 'start' | 'category' | 'bet' | 'question' | 'reveal';
  wagers: Record<Uid, { amount: number; floor: boolean }>;
  results: Record<Uid, WagerResult>;
}

export const wager: GameMode<WagerState> = {
  id: 'wager',
  minPlayers: 2,
  needs: (count) => ({ classic: count, estimate: 0, bluff: 0 }),

  init: (ctx) => ({
    qs: ctx.questions.classic.slice(0, ctx.count).map((q) => prepareMc(q, ctx.rng)),
    i: -1,
    stage: 'start',
    wagers: {},
    results: {},
  }),

  nextPhase(s) {
    const base = () => ({ index: s.i, total: s.qs.length, category: s.qs[s.i].category });
    switch (s.stage) {
      case 'category':
        s.stage = 'bet';
        return {
          name: 'bet',
          durationMs: WAGER_BET_MS,
          input: 'wager',
          audience: 'all',
          view: { kind: 'wager-bet', ...base(), floor: FLOOR_WAGER },
        };
      case 'bet':
        s.stage = 'question';
        return {
          name: 'question',
          durationMs: WAGER_QUESTION_MS,
          input: 'mc',
          audience: 'all',
          view: { kind: 'wager-question', ...base(), ...mcPublic(s.qs[s.i]) },
        };
      case 'question': {
        s.stage = 'reveal';
        const results = Object.entries(s.results);
        const best = results.filter(([, r]) => r.delta > 0).sort((a, b) => b[1].delta - a[1].delta)[0];
        const worst = results.filter(([, r]) => r.delta < 0).sort((a, b) => a[1].delta - b[1].delta)[0];
        return {
          name: 'reveal',
          durationMs: WAGER_REVEAL_MS,
          input: null,
          audience: 'all',
          view: {
            kind: 'wager-reveal',
            ...base(),
            ...mcPublic(s.qs[s.i]),
            correct: s.qs[s.i].correct,
            results: s.results,
            biggestWin: best?.[0] ?? null,
            biggestLoss: worst?.[0] ?? null,
          },
        };
      }
      default:
        if (s.i + 1 >= s.qs.length) return 'round-end';
        s.i++;
        s.stage = 'category';
        s.wagers = {};
        s.results = {};
        return {
          name: 'category',
          durationMs: WAGER_CATEGORY_MS,
          input: null,
          audience: 'all',
          view: { kind: 'wager-category', ...base() },
        };
    }
  },

  validateInput(s, phase, raw, p) {
    if (phase.input === 'mc') return validateMc(s.qs[s.i], raw);
    if (phase.input !== 'wager') return { ok: false, reason: 'no-input' };
    if (!isInt(raw) || raw < 0) return { ok: false, reason: 'invalid' };
    if (raw <= p.score) return { ok: true, value: raw };
    if (p.score < FLOOR_WAGER && raw === FLOOR_WAGER) return { ok: true, value: raw };
    return { ok: false, reason: 'out-of-range' };
  },

  resolve(s, phase, inputs, ctx) {
    const deltas: Record<Uid, number> = {};
    if (phase.name === 'bet') {
      for (const p of Object.values(ctx.players)) {
        const amount = (inputs[p.uid]?.value as number | undefined) ?? 0;
        const floor = amount > p.score;
        s.wagers[p.uid] = { amount, floor };
        if (!floor && p.score > 0) {
          ctx.stats.bravest[p.uid] = Math.max(ctx.stats.bravest[p.uid] ?? 0, amount / p.score);
        }
      }
    } else if (phase.name === 'question') {
      const q = s.qs[s.i];
      for (const p of Object.values(ctx.players)) {
        const w = s.wagers[p.uid] ?? { amount: 0, floor: false };
        const choice = (inputs[p.uid]?.value as number | undefined) ?? null;
        const correct = choice === q.correct;
        // Väärin tai ei vastausta = −panos. Pohjapanoksen voi vain voittaa, pisteet eivät mene alle nollan.
        const delta = correct ? w.amount : w.floor ? 0 : -Math.min(w.amount, p.score);
        if (delta) deltas[p.uid] = delta;
        s.results[p.uid] = { ...w, choice, correct, delta };
      }
    }
    return { deltas };
  },

  answerKey: (s, phase) => (phase.input === 'mc' ? s.qs[s.i].correct : null),
};
