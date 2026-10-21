import type { PlanItem } from './types.ts';

export interface PlanTemplate {
  id: 'quick' | 'full' | 'classroom';
  minutes: number;
  plan: PlanItem[];
}

/** Valmiit illan pohjat. Finaali on oletuksena Panos. */
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'quick',
    minutes: 20,
    plan: [
      { mode: 'classic', count: 6 },
      { mode: 'estimate', count: 5 },
      { mode: 'bluff', count: 3 },
      { mode: 'wager', count: 5 },
    ],
  },
  {
    id: 'full',
    minutes: 40,
    plan: [
      { mode: 'classic', count: 6 },
      { mode: 'bluff', count: 3 },
      { mode: 'survivor', count: 8 },
      { mode: 'estimate', count: 5 },
      { mode: 'duel', count: 3 },
      { mode: 'wager', count: 5 },
    ],
  },
  {
    id: 'classroom',
    minutes: 15,
    plan: [
      { mode: 'classic', count: 8 },
      { mode: 'estimate', count: 5 },
      { mode: 'survivor', count: 8 },
    ],
  },
];

export const DEFAULT_COUNTS: Record<PlanItem['mode'], number> = {
  classic: 6,
  wager: 5,
  bluff: 3,
  survivor: 8,
  estimate: 5,
  duel: 3,
};
