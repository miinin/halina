import type { McQuestion, Rng, Validation } from './types.ts';
import { isInt } from './util.ts';

/** Monivalintakysymys, jonka vaihtoehdot on sekoitettu siemenellisesti. */
export interface PreparedMc {
  id: string;
  category: string;
  prompt: string;
  options: string[];
  correct: number;
}

export function prepareMc(q: McQuestion, rng: Rng): PreparedMc {
  const order = rng.shuffle(q.options.map((_, i) => i));
  return {
    id: q.id,
    category: q.category,
    prompt: q.prompt,
    options: order.map((i) => q.options[i]),
    correct: order.indexOf(q.correct),
  };
}

/** Julkinen osa: ei oikeaa vastausta. */
export function mcPublic(q: PreparedMc) {
  return { category: q.category, prompt: q.prompt, options: q.options };
}

export function validateMc(q: PreparedMc, raw: unknown): Validation<number> {
  if (!isInt(raw) || raw < 0 || raw >= q.options.length) return { ok: false, reason: 'invalid' };
  return { ok: true, value: raw };
}

export function countChoices(q: PreparedMc, values: unknown[]): number[] {
  const counts = q.options.map(() => 0);
  for (const v of values) if (isInt(v) && v >= 0 && v < counts.length) counts[v]++;
  return counts;
}
