import { describe, expect, it } from 'vitest';
import { BUILTIN_PACKS, parsePack } from './index.ts';
import { isTooClose } from '@halina/engine';

describe('kysymyspaketit', () => {
  it('valmis paketti läpäisee skeeman ja määrät täyttyvät', () => {
    for (const p of BUILTIN_PACKS) {
      const r = parsePack(p);
      expect(r.ok, JSON.stringify(!r.ok && r.errors)).toBe(true);
    }
    const p = BUILTIN_PACKS[0];
    expect(p.classic.length).toBeGreaterThanOrEqual(40);
    expect(p.bluff.length).toBeGreaterThanOrEqual(15);
    expect(p.estimate.length).toBeGreaterThanOrEqual(20);
  });

  it('id:t ovat uniikkeja', () => {
    const p = BUILTIN_PACKS[0];
    const ids = [...p.classic, ...p.estimate, ...p.bluff].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('talon valheet eivät ole liian lähellä totuutta', () => {
    for (const q of BUILTIN_PACKS[0].bluff) for (const lie of q.houseLies) expect(isTooClose(lie, q), `${q.id}: ${lie}`).toBe(false);
  });

  it('hylkää virheellisen paketin', () => {
    const r = parsePack({ id: 'x', name: 'x', classic: [{ id: 'a', category: 'k', prompt: 'p', options: ['a'], correct: 3 }] });
    expect(r.ok).toBe(false);
  });
});
