import type { BluffQuestion, GameMode, Player, RoundContext, Uid } from '../types.ts';
import { bump, normalizeText } from '../util.ts';

export const BLUFF_WRITE_MS = 45_000;
export const BLUFF_CHOOSE_MS = 25_000;
export const BLUFF_REVEAL_STEP_MS = 4_000;
export const BLUFF_MAX_LEN = 60;
export const BLUFF_TRUTH_POINTS = 1000;
export const BLUFF_FOOL_POINTS = 500;

export interface BluffOption {
  id: string;
  text: string;
  authors: Uid[];
  house: boolean;
  truth: boolean;
}

interface BluffState {
  qs: BluffQuestion[];
  i: number;
  stage: 'start' | 'write' | 'choose' | 'reveal';
  options: BluffOption[];
  /** piilotettujen valheiden kirjoittajat tällä kysymyksellä */
  hidden: Uid[];
  usedHouse: string[];
  choosers: Record<string, Uid[]>;
  deltas: Record<Uid, number>;
}

/** Hylkää valheen, joka normalisoituna vastaa totuutta tai sen hyväksyttyä muotoa. */
export function isTooClose(lie: string, q: BluffQuestion): boolean {
  const n = normalizeText(lie);
  return [q.answer, ...(q.accepted ?? [])].some((a) => normalizeText(a) === n);
}

const LETTERS = 'ABCDEFGHJKMNPRSTUVWXYZ';

function takeHouseLie(s: BluffState, q: BluffQuestion, taken: Set<string>): string | null {
  for (const lie of q.houseLies) {
    const n = normalizeText(lie);
    if (!taken.has(n) && !s.usedHouse.includes(n)) {
      taken.add(n);
      s.usedHouse.push(n);
      return lie;
    }
  }
  return null;
}

function buildOptions(s: BluffState, lies: Record<Uid, string>, ctx: RoundContext) {
  const q = s.qs[s.i];
  const groups = new Map<string, { text: string; authors: Uid[] }>();
  for (const [uid, text] of Object.entries(lies)) {
    if (s.hidden.includes(uid)) continue;
    const n = normalizeText(text);
    const g = groups.get(n);
    if (g) g.authors.push(uid);
    else groups.set(n, { text: text.trim(), authors: [uid] });
  }
  const taken = new Set([...groups.keys(), normalizeText(q.answer)]);
  const players = Object.values(ctx.players);
  const missing = players.filter((p) => !lies[p.uid] || s.hidden.includes(p.uid)).length;
  let houseCount = missing + (players.length < 4 ? 2 : 0);
  const house: string[] = [];
  while (houseCount-- > 0) {
    const lie = takeHouseLie(s, q, taken);
    if (!lie) break;
    house.push(lie);
  }
  const raw = [
    ...[...groups.values()].map((g) => ({ ...g, house: false, truth: false })),
    ...house.map((text) => ({ text, authors: [], house: true, truth: false })),
    { text: q.answer, authors: [], house: false, truth: true },
  ];
  s.options = ctx.rng.shuffle(raw).map((o, idx) => ({ ...o, id: LETTERS[idx % LETTERS.length] + (idx >= LETTERS.length ? idx : '') }));
}

function chooseView(s: BluffState) {
  return {
    kind: 'bluff-choose',
    index: s.i,
    total: s.qs.length,
    prompt: s.qs[s.i].prompt,
    // ei kirjoittajia eikä totuusmerkintää
    options: s.options.map((o) => ({ id: o.id, text: o.text })),
  };
}

export const bluff: GameMode<BluffState> = {
  id: 'bluff',
  minPlayers: 3,
  needs: (count) => ({ classic: 0, estimate: 0, bluff: count }),

  init: (ctx) => ({
    qs: ctx.questions.bluff.slice(0, ctx.count),
    i: -1,
    stage: 'start',
    options: [],
    hidden: [],
    usedHouse: [],
    choosers: {},
    deltas: {},
  }),

  nextPhase(s) {
    if (s.stage === 'write') {
      s.stage = 'choose';
      return { name: 'choose', durationMs: BLUFF_CHOOSE_MS, input: 'choice', audience: 'all', view: chooseView(s) };
    }
    if (s.stage === 'choose') {
      s.stage = 'reveal';
      const lies = s.options
        .filter((o) => !o.truth && (s.choosers[o.id]?.length ?? 0) > 0)
        .sort((a, b) => (s.choosers[a.id]?.length ?? 0) - (s.choosers[b.id]?.length ?? 0));
      const truth = s.options.find((o) => o.truth)!;
      const sequence = [...lies, truth].map((o) => ({ ...o, choosers: s.choosers[o.id] ?? [] }));
      return {
        name: 'reveal',
        durationMs: BLUFF_REVEAL_STEP_MS * sequence.length + 4_000,
        input: null,
        audience: 'all',
        view: {
          kind: 'bluff-reveal',
          index: s.i,
          total: s.qs.length,
          prompt: s.qs[s.i].prompt,
          stepMs: BLUFF_REVEAL_STEP_MS,
          sequence,
          deltas: s.deltas,
        },
      };
    }
    if (s.i + 1 >= s.qs.length) return 'round-end';
    s.i++;
    s.stage = 'write';
    s.options = [];
    s.hidden = [];
    s.choosers = {};
    s.deltas = {};
    return {
      name: 'write',
      durationMs: BLUFF_WRITE_MS,
      input: 'text',
      audience: 'all',
      view: {
        kind: 'bluff-write',
        index: s.i,
        total: s.qs.length,
        category: s.qs[s.i].category ?? '',
        prompt: s.qs[s.i].prompt,
        maxLength: BLUFF_MAX_LEN,
      },
    };
  },

  validateInput(s, phase, raw, p: Player) {
    if (phase.input === 'text') {
      if (typeof raw !== 'string' || !normalizeText(raw)) return { ok: false, reason: 'empty' };
      if (raw.trim().length > BLUFF_MAX_LEN) return { ok: false, reason: 'too-long' };
      if (isTooClose(raw, s.qs[s.i])) return { ok: false, reason: 'too-close' };
      return { ok: true, value: raw.trim() };
    }
    if (phase.input === 'choice') {
      const o = s.options.find((x) => x.id === raw);
      if (!o) return { ok: false, reason: 'invalid' };
      if (o.authors.includes(p.uid)) return { ok: false, reason: 'own-lie' };
      return { ok: true, value: o.id };
    }
    return { ok: false, reason: 'no-input' };
  },

  resolve(s, phase, inputs, ctx) {
    const deltas: Record<Uid, number> = {};
    if (phase.name === 'write') {
      const lies: Record<Uid, string> = {};
      for (const [uid, inp] of Object.entries(inputs)) lies[uid] = inp.value as string;
      buildOptions(s, lies, ctx);
    } else if (phase.name === 'choose') {
      for (const [uid, inp] of Object.entries(inputs)) {
        (s.choosers[inp.value as string] ??= []).push(uid);
      }
      for (const o of s.options) {
        const ch = s.choosers[o.id] ?? [];
        if (o.truth) {
          for (const uid of ch) deltas[uid] = (deltas[uid] ?? 0) + BLUFF_TRUTH_POINTS;
        } else {
          for (const uid of ch) bump(ctx.stats.fooled, uid);
          // kaksi samaa valhetta: molemmat kirjoittajat saavat pisteet
          for (const a of o.authors) {
            deltas[a] = (deltas[a] ?? 0) + BLUFF_FOOL_POINTS * ch.length;
            bump(ctx.stats.fooledOthers, a, ch.length);
          }
        }
      }
      s.deltas = deltas;
    }
    return { deltas };
  },

  moderate(s, phase, uid, ctx) {
    if (phase.name === 'write') {
      if (!s.hidden.includes(uid)) s.hidden.push(uid);
      return null;
    }
    if (phase.name === 'choose') {
      const o = s.options.find((x) => x.authors.includes(uid));
      if (!o) return null;
      if (!s.hidden.includes(uid)) s.hidden.push(uid);
      o.authors = o.authors.filter((a) => a !== uid);
      if (o.authors.length === 0) {
        const taken = new Set(s.options.map((x) => normalizeText(x.text)));
        const lie = takeHouseLie(s, s.qs[s.i], taken);
        if (lie) {
          o.text = lie;
          o.house = true;
        } else {
          s.options = s.options.filter((x) => x !== o);
        }
      }
      void ctx;
      return chooseView(s);
    }
    return null;
  },

  answerKey(s, phase) {
    if (phase.input === 'choice') return s.options.find((o) => o.truth)?.id ?? null;
    if (phase.input === 'text') return { answer: s.qs[s.i].answer, houseLies: s.qs[s.i].houseLies };
    return null;
  },
};
