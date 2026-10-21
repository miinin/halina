import type { DuelPairing, EstimateQuestion, GameMode, Player, Rng, RoundContext, Uid } from '../types.ts';
import { mcPublic, prepareMc, validateMc, type PreparedMc } from '../mc.ts';
import { relativeError, validateNumber } from './estimate.ts';
import { isInt } from '../util.ts';

export const DUEL_INTRO_MS = 5_000;
export const DUEL_BET_MS = 10_000;
export const DUEL_QUESTION_MS = 10_000;
export const DUEL_Q_REVEAL_MS = 3_500;
export const DUEL_TIEBREAK_MS = 15_000;
export const DUEL_RESULT_MS = 7_000;
export const DUEL_ROUNDS = 3;
export const DUEL_WIN_POINTS = 1000;
export const DUEL_STEAL = 0.1;
export const DUEL_BET_POINTS = 300;

interface Duel {
  a: Uid;
  b: Uid;
  wins: Record<Uid, number>;
  qi: number;
  bets: Record<Uid, Uid>;
  lastQ: { winner: Uid | null; answers: Record<Uid, { choice: number | null; correct: boolean; ms: number | null }> } | null;
  tiebreak: { prompt: string; unit: string; answer: number; guesses: Record<Uid, number> } | null;
  result: { winner: Uid; loser: Uid; steal: number; bettors: Record<Uid, { pick: Uid; correct: boolean }> } | null;
}

interface DuelState {
  mcQs: PreparedMc[];
  estQs: EstimateQuestion[];
  mcPtr: number;
  estPtr: number;
  planned: number;
  done: number;
  used: Uid[];
  pairing: DuelPairing;
  stage: 'start' | 'intro' | 'bet' | 'q' | 'q-reveal' | 'tiebreak' | 'result';
  duel: Duel | null;
}

/** Valitsee parin: oletuksena kärkipelaaja vs. satunnainen haastaja alemmasta puoliskosta. */
export function pickPair(players: Player[], pairing: DuelPairing, rng: Rng): [Uid, Uid] | null {
  if (players.length < 2) return null;
  const sorted = [...players].sort((x, y) => y.score - x.score || x.uid.localeCompare(y.uid));
  if (pairing === 'bottom-two') return [sorted[sorted.length - 2].uid, sorted[sorted.length - 1].uid];
  if (pairing === 'random') {
    const [x, y] = rng.shuffle(sorted);
    return [x.uid, y.uid];
  }
  const top = sorted[0];
  const rest = sorted.slice(1);
  const lower = rest.slice(Math.floor(rest.length / 2));
  return [top.uid, rng.pick(lower).uid];
}

function others(d: Duel, ctx: RoundContext): Uid[] {
  return Object.values(ctx.players)
    .filter((p) => p.uid !== d.a && p.uid !== d.b)
    .map((p) => p.uid);
}

function finalize(d: Duel, winner: Uid, ctx: RoundContext, deltas: Record<Uid, number>) {
  const loser = winner === d.a ? d.b : d.a;
  const steal = Math.round((ctx.players[loser]?.score ?? 0) * DUEL_STEAL);
  deltas[winner] = (deltas[winner] ?? 0) + DUEL_WIN_POINTS + steal;
  deltas[loser] = (deltas[loser] ?? 0) - steal;
  const bettors: Record<Uid, { pick: Uid; correct: boolean }> = {};
  for (const [uid, pick] of Object.entries(d.bets)) {
    const correct = pick === winner;
    bettors[uid] = { pick, correct };
    if (correct) deltas[uid] = (deltas[uid] ?? 0) + DUEL_BET_POINTS;
  }
  d.result = { winner, loser, steal, bettors };
}

export const duel: GameMode<DuelState> = {
  id: 'duel',
  minPlayers: 2,
  needs: (count) => ({ classic: count * DUEL_ROUNDS, estimate: count, bluff: 0 }),

  init: (ctx) => ({
    mcQs: ctx.questions.classic.map((q) => prepareMc(q, ctx.rng)),
    estQs: ctx.questions.estimate,
    mcPtr: 0,
    estPtr: 0,
    planned: ctx.count,
    done: 0,
    used: [],
    pairing: ctx.options.duelPairing ?? 'top-vs-random',
    stage: 'start',
    duel: null,
  }),

  nextPhase(s, ctx) {
    const d = s.duel;
    const base = () => ({ a: d!.a, b: d!.b, wins: d!.wins, duelIndex: s.done, total: s.planned });
    const mc = () => s.mcQs[s.mcPtr % s.mcQs.length];

    const startQuestion = () => {
      s.stage = 'q';
      d!.qi++;
      return {
        name: 'q',
        durationMs: DUEL_QUESTION_MS,
        input: 'mc' as const,
        audience: [d!.a, d!.b],
        view: { kind: 'duel-question', ...base(), qIndex: d!.qi, ...mcPublic(mc()) },
      };
    };

    switch (s.stage) {
      case 'intro': {
        if (others(d!, ctx).length > 0) {
          s.stage = 'bet';
          return {
            name: 'bet',
            durationMs: DUEL_BET_MS,
            input: 'bet',
            audience: others(d!, ctx),
            view: { kind: 'duel-bet', ...base() },
          };
        }
        return startQuestion();
      }
      case 'bet':
        return startQuestion();
      case 'q':
        s.stage = 'q-reveal';
        return {
          name: 'q-reveal',
          durationMs: DUEL_Q_REVEAL_MS,
          input: null,
          audience: 'all',
          view: {
            kind: 'duel-q-reveal',
            ...base(),
            qIndex: d!.qi,
            ...mcPublic(mc()),
            correct: mc().correct,
            winner: d!.lastQ?.winner ?? null,
            answers: d!.lastQ?.answers ?? {},
          },
        };
      case 'q-reveal': {
        s.mcPtr++;
        if (!d!.result && d!.qi < DUEL_ROUNDS) return startQuestion();
        if (!d!.result) {
          // erät eivät ratkaisseet → Arvio-kysymys
          s.stage = 'tiebreak';
          const q = s.estQs[s.estPtr++ % Math.max(s.estQs.length, 1)];
          d!.tiebreak = {
            prompt: q?.prompt ?? 'Arvaa luku väliltä 1–100',
            unit: q?.unit ?? '',
            answer: q?.answer ?? 1 + ctx.rng.int(100),
            guesses: {},
          };
          return {
            name: 'tiebreak',
            durationMs: DUEL_TIEBREAK_MS,
            input: 'number',
            audience: [d!.a, d!.b],
            view: { kind: 'duel-tiebreak', ...base(), prompt: d!.tiebreak.prompt, unit: d!.tiebreak.unit },
          };
        }
        s.stage = 'result';
        return { name: 'result', durationMs: DUEL_RESULT_MS, input: null, audience: 'all', view: resultView() };
      }
      case 'tiebreak':
        s.stage = 'result';
        return { name: 'result', durationMs: DUEL_RESULT_MS, input: null, audience: 'all', view: resultView() };
      default: {
        // uusi kaksintaistelu
        if (s.duel) s.done++;
        if (s.done >= s.planned) return 'round-end';
        const available = Object.values(ctx.players).filter((p) => p.connected && !s.used.includes(p.uid));
        const pair = pickPair(available, s.pairing, ctx.rng);
        if (!pair) return 'round-end';
        s.used.push(...pair);
        s.duel = { a: pair[0], b: pair[1], wins: { [pair[0]]: 0, [pair[1]]: 0 }, qi: 0, bets: {}, lastQ: null, tiebreak: null, result: null };
        s.stage = 'intro';
        return { name: 'intro', durationMs: DUEL_INTRO_MS, input: null, audience: 'all', view: { kind: 'duel-intro', a: pair[0], b: pair[1], wins: s.duel.wins, duelIndex: s.done, total: s.planned } };
      }
    }

    function resultView() {
      return {
        kind: 'duel-result',
        ...base(),
        result: d!.result,
        tiebreak: d!.tiebreak,
      };
    }
  },

  validateInput(s, phase, raw) {
    const d = s.duel;
    if (!d) return { ok: false, reason: 'no-input' };
    if (phase.input === 'bet') {
      return raw === d.a || raw === d.b ? { ok: true, value: raw } : { ok: false, reason: 'invalid' };
    }
    if (phase.input === 'mc') return validateMc(s.mcQs[s.mcPtr % s.mcQs.length], raw);
    if (phase.input === 'number') return validateNumber(raw);
    return { ok: false, reason: 'no-input' };
  },

  resolve(s, phase, inputs, ctx) {
    const deltas: Record<Uid, number> = {};
    const d = s.duel;
    if (!d) return { deltas };
    if (phase.name === 'bet') {
      for (const [uid, inp] of Object.entries(inputs)) d.bets[uid] = inp.value as Uid;
    } else if (phase.name === 'q') {
      const q = s.mcQs[s.mcPtr % s.mcQs.length];
      const answers: NonNullable<Duel['lastQ']>['answers'] = {};
      for (const uid of [d.a, d.b]) {
        const inp = inputs[uid];
        const choice = inp && isInt(inp.value) ? inp.value : null;
        answers[uid] = { choice, correct: choice === q.correct, ms: inp?.ms ?? null };
      }
      // nopein oikea voittaa erän
      const right = [d.a, d.b].filter((uid) => answers[uid].correct).sort((x, y) => answers[x].ms! - answers[y].ms!);
      const winner = right[0] ?? null;
      if (winner) d.wins[winner]++;
      d.lastQ = { winner, answers };
      const need = Math.floor(DUEL_ROUNDS / 2) + 1;
      const decided = d.wins[d.a] >= need || d.wins[d.b] >= need;
      if (decided || d.qi >= DUEL_ROUNDS) {
        if (d.wins[d.a] !== d.wins[d.b]) finalize(d, d.wins[d.a] > d.wins[d.b] ? d.a : d.b, ctx, deltas);
      }
    } else if (phase.name === 'tiebreak' && d.tiebreak) {
      const t = d.tiebreak;
      for (const uid of [d.a, d.b]) if (inputs[uid]) t.guesses[uid] = inputs[uid].value as number;
      const ranked = [d.a, d.b]
        .filter((uid) => uid in t.guesses)
        .sort((x, y) => relativeError(t.guesses[x], t.answer) - relativeError(t.guesses[y], t.answer) || inputs[x].ms - inputs[y].ms);
      const winner = ranked[0] ?? ctx.rng.pick([d.a, d.b]);
      finalize(d, winner, ctx, deltas);
    }
    return { deltas };
  },

  answerKey(s, phase) {
    if (phase.input === 'mc') return s.mcQs[s.mcPtr % s.mcQs.length].correct;
    if (phase.input === 'number') return s.duel?.tiebreak?.answer ?? null;
    return null;
  },
};
