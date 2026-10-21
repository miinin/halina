import type { QuestionPack } from '@halina/engine';
import fiPerus from './packs/fi-perus.json';

export * from './schema.ts';

export const BUILTIN_PACKS: QuestionPack[] = [fiPerus as QuestionPack];
