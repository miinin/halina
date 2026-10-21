import type { Audience, Player, Rng, Uid } from './types.ts';

/** Siemenellinen mulberry32. Tila on yksi kokonaisluku, joten se on helppo tallentaa. */
export function createRng(holder: { rngState: number }): Rng {
  const next = () => {
    holder.rngState = (holder.rngState + 0x6d2b79f5) | 0;
    let t = holder.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(next() * max);
  return {
    next,
    int,
    pick: (arr) => arr[int(arr.length)],
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

/** pisteet = round(1000 · (1 − 0,5 · t/T)) */
export function speedPoints(ms: number, durationMs: number): number {
  const t = Math.min(Math.max(ms, 0), durationMs);
  return Math.round(1000 * (1 - 0.5 * (t / durationMs)));
}

/** pienet kirjaimet, ei välimerkkejä, ei ylimääräisiä välilyöntejä */
export function normalizeText(s: string): string {
  return s
    .toLocaleLowerCase('fi')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inAudience(audience: Audience, p: Player): boolean {
  if (audience === 'all') return true;
  if (audience === 'alive') return p.alive;
  return audience.includes(p.uid);
}

export function audienceUids(audience: Audience, players: Record<Uid, Player>): Uid[] {
  return Object.values(players)
    .filter((p) => inAudience(audience, p))
    .map((p) => p.uid);
}

export function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function addDelta(deltas: Record<Uid, number>, uid: Uid, d: number) {
  deltas[uid] = (deltas[uid] ?? 0) + d;
}

export function bump(rec: Record<Uid, number>, uid: Uid, d = 1) {
  rec[uid] = (rec[uid] ?? 0) + d;
}

export const OPTION_SHAPES = ['triangle', 'diamond', 'circle', 'square'] as const;
