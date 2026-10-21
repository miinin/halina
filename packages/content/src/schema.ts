import { z } from 'zod';
import type { QuestionPack } from '@halina/engine';

const text = (max: number) => z.string().trim().min(1).max(max);

export const mcQuestionSchema = z
  .object({
    id: text(40),
    category: text(40),
    prompt: text(200),
    options: z.array(text(80)).min(2).max(4),
    correct: z.number().int().min(0),
  })
  .refine((q) => q.correct < q.options.length, { message: 'correct osoittaa olemattomaan vaihtoehtoon', path: ['correct'] });

export const estimateQuestionSchema = z.object({
  id: text(40),
  category: text(40).optional(),
  prompt: text(200),
  unit: z.string().max(20).optional(),
  answer: z.number().finite(),
});

export const bluffQuestionSchema = z.object({
  id: text(40),
  category: text(40).optional(),
  prompt: text(200).refine((p) => p.includes('____'), { message: 'kysymyksessä pitää olla aukko ____' }),
  answer: text(60),
  accepted: z.array(text(60)).optional(),
  houseLies: z.array(text(60)).min(1),
});

export const questionPackSchema = z.object({
  id: text(40),
  name: text(60),
  language: z.string().min(2).max(10).default('fi'),
  classic: z.array(mcQuestionSchema).default([]),
  estimate: z.array(estimateQuestionSchema).default([]),
  bluff: z.array(bluffQuestionSchema).default([]),
});

export type ParsedPack = z.infer<typeof questionPackSchema>;

export type ParseResult = { ok: true; pack: QuestionPack } | { ok: false; errors: string[] };

/** Validoi tuodun JSON-paketin. Virheet palautetaan luettavina riveinä. */
export function parsePack(input: unknown): ParseResult {
  const r = questionPackSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, errors: r.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(juuri)'}: ${i.message}`) };
  }
  const pack: QuestionPack = r.data;
  if (pack.classic.length + pack.estimate.length + pack.bluff.length === 0) {
    return { ok: false, errors: ['paketissa ei ole yhtään kysymystä'] };
  }
  return { ok: true, pack };
}
