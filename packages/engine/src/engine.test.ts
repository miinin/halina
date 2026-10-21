import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  advance,
  answerKey,
  createGame,
  createRng,
  expectedResponders,
  isPhaseComplete,
  isSuspicious,
  isTooClose,
  judgeCellar,
  moderate,
  normalizeText,
  PLAN_TEMPLATES,
  pickPair,
  scoreEstimates,
  speedPoints,
  streakBonus,
  validateInput,
  type GameState,
  type PlanItem,
  type Player,
  type QuestionPack,
  type TimedInput,
} from './index.ts';

// ---------- apurit ----------

const pack: QuestionPack = {
  id: 'test',
  name: 'Testi',
  language: 'fi',
  classic: Array.from({ length: 60 }, (_, i) => ({
    id: `c${i}`,
    category: `Kat${i % 5}`,
    prompt: `Kysymys ${i}?`,
    options: ['oikea', 'väärä 1', 'väärä 2', 'väärä 3'],
    correct: 0,
  })),
  estimate: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, prompt: `Arvio ${i}?`, unit: 'kpl', answer: (i + 1) * 100 })),
  bluff: Array.from({ length: 10 }, (_, i) => ({
    id: `b${i}`,
    prompt: `Bluffi ${i}: ____`,
    answer: `Totuus ${i}`,
    accepted: [`tosi ${i}`],
    houseLies: [`Talo A${i}`, `Talo B${i}`, `Talo C${i}`],
  })),
};

function players(n: number): Record<string, Player> {
  const out: Record<string, Player> = {};
  for (let i = 0; i < n; i++) {
    const uid = `u${i}`;
    out[uid] = { uid, name: `P${i}`, avatar: 'fox', score: 0, alive: true, connected: true };
  }
  return out;
}

function game(plan: PlanItem[], n = 4, seed = 1): GameState {
  return createGame({ seed, plan, pack, players: players(n) });
}

/** Tuottaa syötteet vaiheeseen: `pick` päättää arvon jokaiselle odotetulle pelaajalle. */
type Picker = (g: GameState, uid: string, rng: () => number) => unknown;

const randomPicker: Picker = (g, uid, r) => {
  const phase = g.phase!;
  const view = phase.view as any;
  switch (phase.input) {
    case 'mc':
      return Math.floor(r() * view.options.length);
    case 'wager': {
      const s = g.players[uid].score;
      return r() < 0.2 && s < 500 ? 500 : Math.floor(r() * (s + 1));
    }
    case 'number':
      return Math.round(r() * 3000);
    case 'text':
      return r() < 0.1 ? 'Totuus 0' : `valhe ${uid} ${Math.floor(r() * 3)}`;
    case 'choice': {
      const opts = view.options as { id: string }[];
      return opts[Math.floor(r() * opts.length)].id;
    }
    case 'door':
      return Math.floor(r() * 3);
    case 'math':
      return [1, 2, 3].map(() => Math.floor(r() * 150));
    case 'vote':
    case 'bet': {
      const c = (view.cellar ?? [view.a, view.b]) as string[];
      return c[Math.floor(r() * c.length)];
    }
    default:
      return null;
  }
};

function collect(g: GameState, pick: Picker, r: () => number): Record<string, TimedInput> {
  const inputs: Record<string, TimedInput> = {};
  for (const uid of expectedResponders(g)) {
    if (r() < 0.1) continue; // joku jättää vastaamatta
    inputs[uid] = { value: pick(g, uid, r), ms: Math.floor(r() * g.phase!.durationMs) };
  }
  return inputs;
}

function playThrough(g: GameState, pick: Picker = randomPicker, seed = 7, onStep?: (g: GameState) => void) {
  const holder = { rngState: seed };
  const rng = createRng(holder);
  let guard = 0;
  g = advance(g);
  while (g.stage !== 'podium') {
    onStep?.(g);
    g = advance(g, collect(g, pick, rng.next));
    if (++guard > 2000) throw new Error('peli ei päättynyt');
  }
  onStep?.(g);
  return g;
}

const answerPicker: Picker = (g) => {
  const k = answerKey(g);
  if (g.phase!.input === 'text') return 'oma valhe';
  return k ?? randomPicker(g, 'u0', Math.random);
};

// ---------- yksikkötestit ----------

describe('perusvisa', () => {
  it('nopeuspisteet: heti ~1000, viime sekunnilla 500', () => {
    expect(speedPoints(0, 20000)).toBe(1000);
    expect(speedPoints(20000, 20000)).toBe(500);
    expect(speedPoints(10000, 20000)).toBe(750);
  });

  it('putkibonus +100 per peräkkäinen oikea, enintään +500', () => {
    expect([1, 2, 3, 6, 10].map(streakBonus)).toEqual([0, 100, 200, 500, 500]);
  });

  it('oikea vastaus antaa pisteet, väärä 0', () => {
    let g = advance(game([{ mode: 'classic', count: 2 }], 2)); // intro
    g = advance(g); // kysymys
    expect(g.phase!.name).toBe('question');
    const correct = answerKey(g) as number;
    g = advance(g, { u0: { value: correct, ms: 0 }, u1: { value: (correct + 1) % 4, ms: 0 } });
    expect(g.phase!.name).toBe('reveal');
    expect(g.players.u0.score).toBe(1000);
    expect(g.players.u1.score).toBe(0);
  });

  it('julkinen näkymä ei paljasta oikeaa vastausta ennen paljastusta', () => {
    let g = advance(advance(game([{ mode: 'classic', count: 1 }])));
    expect(JSON.stringify(g.phase!.view)).not.toContain('correct');
  });
});

describe('Panos', () => {
  function toQuestion(score: number) {
    let g = game([{ mode: 'wager', count: 1 }], 2);
    g.players.u0.score = score;
    g.players.u1.score = score;
    g = advance(advance(g)); // intro → kategoria
    expect(g.phase!.name).toBe('category');
    return advance(g); // panostus
  }

  it('kaikki peliin tuplaa pisteet, väärin menettää panoksen', () => {
    let g = toQuestion(1000);
    g = advance(g, { u0: { value: 1000, ms: 0 }, u1: { value: 400, ms: 0 } });
    const k = answerKey(g) as number;
    g = advance(g, { u0: { value: k, ms: 0 }, u1: { value: (k + 1) % 4, ms: 0 } });
    expect(g.players.u0.score).toBe(2000);
    expect(g.players.u1.score).toBe(600);
    expect((g.phase!.view as any).biggestWin).toBe('u0');
    expect((g.phase!.view as any).biggestLoss).toBe('u1');
  });

  it('pohjapanos alle 500 pisteellä: voitto +500, häviö 0', () => {
    let g = toQuestion(100);
    expect(validateInput(g, 'u0', 500).ok).toBe(true);
    expect(validateInput(g, 'u0', 300).ok).toBe(false);
    g = advance(g, { u0: { value: 500, ms: 0 }, u1: { value: 500, ms: 0 } });
    const k = answerKey(g) as number;
    g = advance(g, { u0: { value: k, ms: 0 }, u1: { value: (k + 1) % 4, ms: 0 } });
    expect(g.players.u0.score).toBe(600);
    expect(g.players.u1.score).toBe(100);
  });

  it('panostamatta jättänyt = panos 0', () => {
    let g = toQuestion(800);
    g = advance(g, {});
    g = advance(g, {});
    expect(g.players.u0.score).toBe(800);
  });
});

describe('Bluffi', () => {
  function toWrite(n = 4) {
    const g = advance(advance(game([{ mode: 'bluff', count: 1 }], n)));
    expect(g.phase!.name).toBe('write');
    return g;
  }

  it('normalisointi ja liian lähellä totuutta', () => {
    expect(normalizeText('  Totuus,   0!! ')).toBe('totuus 0');
    const q = pack.bluff[0];
    expect(isTooClose('TOTUUS 0.', q)).toBe(true);
    expect(isTooClose('tosi 0', q)).toBe(true);
    expect(isTooClose('jotain muuta', q)).toBe(false);
  });

  it('hylkää totuuden valheena ja oman valheen valinnan', () => {
    let g = toWrite();
    const truth = (answerKey(g) as any).answer;
    expect(validateInput(g, 'u0', truth)).toEqual({ ok: false, reason: 'too-close' });
    g = advance(g, {
      u0: { value: 'Kissa', ms: 0 },
      u1: { value: 'kissa!', ms: 0 },
      u2: { value: 'Koira', ms: 0 },
      u3: { value: 'Hevonen', ms: 0 },
    });
    expect(g.phase!.name).toBe('choose');
    const opts = (g.phase!.view as any).options as { id: string; text: string }[];
    // kaksi samaa valhetta yhdistetty: Kissa, Koira, Hevonen + totuus
    expect(opts).toHaveLength(4);
    const cat = opts.find((o) => normalizeText(o.text) === 'kissa')!;
    expect(validateInput(g, 'u0', cat.id)).toEqual({ ok: false, reason: 'own-lie' });
    expect(JSON.stringify(g.phase!.view)).not.toContain('authors');
  });

  it('pisteytys: totuus +1000, huijaus +500 per huijattu, molemmille kirjoittajille', () => {
    let g = toWrite();
    g = advance(g, {
      u0: { value: 'Kissa', ms: 0 },
      u1: { value: 'kissa', ms: 0 },
      u2: { value: 'Koira', ms: 0 },
      u3: { value: 'Hevonen', ms: 0 },
    });
    const opts = (g.phase!.view as any).options as { id: string; text: string }[];
    const id = (t: string) => opts.find((o) => normalizeText(o.text) === t)!.id;
    const truth = answerKey(g) as string;
    g = advance(g, {
      u0: { value: truth, ms: 0 },
      u2: { value: id('kissa'), ms: 0 },
      u3: { value: id('kissa'), ms: 0 },
      u1: { value: id('koira'), ms: 0 },
    });
    expect(g.players.u0.score).toBe(1000 + 1000);
    expect(g.players.u1.score).toBe(1000);
    expect(g.players.u2.score).toBe(500);
    expect(g.players.u3.score).toBe(0);
    expect(g.stats.fooled.u3).toBe(1);
  });

  it('puuttuvat valheet täytetään talon valheilla, alle 4 pelaajalla +2', () => {
    let g = toWrite(3);
    g = advance(g, { u0: { value: 'Kissa', ms: 0 } });
    const opts = (g.phase!.view as any).options;
    // 1 pelaajan valhe + 2 puuttuvaa + 2 lisää (vain 3 talon valhetta saatavilla) + totuus
    expect(opts).toHaveLength(1 + 3 + 1);
  });

  it('host voi piilottaa valheen', () => {
    let g = toWrite();
    g = moderate(g, 'u0');
    g = advance(g, {
      u0: { value: 'Rumaa', ms: 0 },
      u1: { value: 'Kissa', ms: 0 },
      u2: { value: 'Koira', ms: 0 },
      u3: { value: 'Hevonen', ms: 0 },
    });
    const texts = ((g.phase!.view as any).options as { text: string }[]).map((o) => o.text);
    expect(texts).not.toContain('Rumaa');
  });

  it('kirosanasuodatin merkitsee epäilyttävät', () => {
    expect(isSuspicious('vittu mikä')).toBe(true);
    expect(isSuspicious('F U C K')).toBe(true);
    expect(isSuspicious('saunakiuas')).toBe(false);
    expect(isSuspicious('cocktail')).toBe(false);
  });
});

describe('Selviytyjä', () => {
  it('väärin vastanneet kellariin, kuolleet haamuiksi, bonus elossa oleville', () => {
    let g = advance(advance(game([{ mode: 'survivor', count: 1 }], 4)));
    const k = answerKey(g) as number;
    g = advance(g, {
      u0: { value: k, ms: 0 },
      u1: { value: k, ms: 0 },
      u2: { value: (k + 1) % 4, ms: 0 },
    });
    expect(g.phase!.name).toBe('reveal');
    expect((g.phase!.view as any).cellar).toEqual(['u2', 'u3']);
    g = advance(g);
    expect(g.phase!.name).toBe('cellar');
    expect(g.phase!.audience).toEqual(['u2', 'u3']);
    g = advance(g, {}); // ei vastauksia → kellarilaiset kuolevat (paitsi uhrauksessa yksi)
    expect(g.phase!.name).toBe('verdict');
    const dead = ((g.phase!.view as any).verdict.dead as string[]);
    expect(dead.length).toBeGreaterThanOrEqual(1);
    for (const uid of dead) expect(g.players[uid].alive).toBe(false);
    g = advance(g); // kierros loppuu → podium
    expect(g.stage).toBe('podium');
    expect(g.players.u0.score).toBe(1000 + 1500);
    // kierroksen jälkeen kaikki taas elossa
    expect(Object.values(g.players).every((p) => p.alive)).toBe(true);
  });

  it('haaste ei tapa kaikkia eläviä', () => {
    const rng = createRng({ rngState: 3 });
    for (const type of ['doors', 'math'] as const) {
      const v = judgeCellar(type, ['a', 'b', 'c'], {}, [{ text: '1+1', answer: 2 }], 0, rng);
      expect(v.dead).toHaveLength(2);
      expect(v.spared).not.toBeNull();
    }
  });

  it('pikalasku: väärin vastanneet ja hitain kuolevat', () => {
    const problems = [{ text: '', answer: 1 }, { text: '', answer: 2 }, { text: '', answer: 3 }];
    const v = judgeCellar(
      'math',
      ['a', 'b', 'c'],
      { a: { value: [1, 2, 3], ms: 100 }, b: { value: [1, 2, 3], ms: 900 }, c: { value: [1, 2, 0], ms: 50 } },
      problems,
      2,
      createRng({ rngState: 1 }),
    );
    expect(v.dead.sort()).toEqual(['b', 'c']);
  });

  it('uhraus: eniten ääniä saanut kuolee', () => {
    const v = judgeCellar(
      'sacrifice',
      ['a', 'b', 'c'],
      { a: { value: 'c', ms: 0 }, b: { value: 'c', ms: 0 }, c: { value: 'a', ms: 0 } },
      [],
      1,
      createRng({ rngState: 1 }),
    );
    expect(v.dead).toEqual(['c']);
  });
});

describe('Arvio', () => {
  it('sijoitus suhteellisen virheen mukaan, täsmäosuma +500, sama virhe = sama sija', () => {
    const r = scoreEstimates(100, [
      { uid: 'a', guess: 100 },
      { uid: 'b', guess: 110 },
      { uid: 'c', guess: 90 },
      { uid: 'd', guess: 140 },
      { uid: 'e', guess: 200 },
    ]);
    const by = Object.fromEntries(r.map((x) => [x.uid, x]));
    expect(by.a.points).toBe(1500);
    expect(by.b.rank).toBe(2);
    expect(by.c.rank).toBe(2);
    expect(by.b.points).toBe(700);
    expect(by.d.rank).toBe(4);
    expect(by.d.points).toBe(200);
    expect(by.e.points).toBe(0);
  });

  it('Ylittämättä: yli menneet saavat 0', () => {
    const r = scoreEstimates(100, [{ uid: 'a', guess: 101 }, { uid: 'b', guess: 50 }], 'under');
    const by = Object.fromEntries(r.map((x) => [x.uid, x]));
    expect(by.a.points).toBe(0);
    expect(by.b.points).toBe(1000);
  });

  it('toimii pienille ja suurille luvuille', () => {
    expect(scoreEstimates(0, [{ uid: 'a', guess: 0.4 }])[0].err).toBeCloseTo(0.4);
    expect(scoreEstimates(7_000_000, [{ uid: 'a', guess: 7_700_000 }])[0].err).toBeCloseTo(0.1);
  });
});

describe('Kaksintaistelu', () => {
  it('pari: kärki vs. alempi puolisko', () => {
    const ps = Object.values(players(6)).map((p, i) => ({ ...p, score: 1000 - i * 100 }));
    for (let s = 0; s < 20; s++) {
      const [a, b] = pickPair(ps, 'top-vs-random', createRng({ rngState: s }))!;
      expect(a).toBe('u0');
      expect(['u3', 'u4', 'u5']).toContain(b);
    }
  });

  it('voittaja +1000 ja 10 % häviäjältä, oikea veto +300', () => {
    let g = game([{ mode: 'duel', count: 1 }], 3);
    g.players.u0.score = 2000;
    g.players.u1.score = 1000;
    g.players.u2.score = 500;
    g = advance(advance(g)); // intro → duel intro
    const { a, b } = g.phase!.view as any;
    const watcher = ['u0', 'u1', 'u2'].find((u) => u !== a && u !== b)!;
    g = advance(g); // veto
    expect(g.phase!.name).toBe('bet');
    g = advance(g, { [watcher]: { value: a, ms: 0 } });
    const before = { a: g.players[a].score, b: g.players[b].score, w: g.players[watcher].score };
    for (let i = 0; i < 2; i++) {
      const k = answerKey(g) as number;
      g = advance(g, { [a]: { value: k, ms: 100 }, [b]: { value: k, ms: 500 } });
      g = advance(g); // reveal → seuraava
    }
    expect(g.phase!.name).toBe('result');
    const steal = Math.round(before.b * 0.1);
    expect(g.players[a].score).toBe(before.a + 1000 + steal);
    expect(g.players[b].score).toBe(before.b - steal);
    expect(g.players[watcher].score).toBe(before.w + 300);
  });

  it('ratkeamaton kaksintaistelu menee Arvio-kysymykseen', () => {
    let g = advance(advance(game([{ mode: 'duel', count: 1 }], 2)));
    g = advance(g); // ei yleisöä → suoraan kysymykseen
    expect(g.phase!.name).toBe('q');
    for (let i = 0; i < 3; i++) {
      g = advance(g, {});
      g = advance(g);
    }
    expect(g.phase!.name).toBe('tiebreak');
  });
});

describe('peli kokonaisuutena', () => {
  it('kaikki illan pohjat pelattavissa loppuun', () => {
    for (const t of PLAN_TEMPLATES) {
      const g = playThrough(game(t.plan, 6));
      expect(g.stage).toBe('podium');
      expect(g.skipped).toEqual([]);
    }
  });

  it('liian vähän pelaajia → kierros ohitetaan', () => {
    const g = playThrough(game([{ mode: 'bluff', count: 1 }, { mode: 'classic', count: 1 }], 2));
    expect(g.skipped).toEqual([0]);
  });

  it('deterministinen: sama siemen ja syötteet → sama lopputulos', () => {
    const a = playThrough(game(PLAN_TEMPLATES[1].plan, 5, 42), randomPicker, 9);
    const b = playThrough(game(PLAN_TEMPLATES[1].plan, 5, 42), randomPicker, 9);
    expect(a).toEqual(b);
  });

  it('advance ei muuta alkuperäistä tilaa', () => {
    const g = advance(game(PLAN_TEMPLATES[0].plan));
    const copy = structuredClone(g);
    advance(g);
    expect(g).toEqual(copy);
  });

  it('vaihe valmis, kun kaikki odotetut ovat vastanneet', () => {
    let g = advance(advance(game([{ mode: 'classic', count: 1 }], 2)));
    expect(isPhaseComplete(g, { u0: 1 })).toBe(false);
    expect(isPhaseComplete(g, { u0: 1, u1: 2 })).toBe(true);
    g.players.u1.connected = false;
    expect(isPhaseComplete(g, { u0: 1 })).toBe(true);
  });

  it('tietävät pelaajat voittavat arvailijat', () => {
    const g = playThrough(game(PLAN_TEMPLATES[0].plan, 4), (g, uid, r) =>
      uid === 'u0' ? answerPicker(g, uid, r) : randomPicker(g, uid, r),
    );
    const top = Object.values(g.players).sort((a, b) => b.score - a.score)[0];
    expect(top.uid).toBe('u0');
  });
});

// ---------- ominaisuustestit ----------

describe('ominaisuudet', () => {
  const planArb = fc.array(
    fc.record({
      mode: fc.constantFrom('classic', 'wager', 'bluff', 'survivor', 'estimate', 'duel' as const),
      count: fc.integer({ min: 1, max: 4 }),
    }),
    { minLength: 1, maxLength: 4 },
  ) as fc.Arbitrary<PlanItem[]>;

  it('pisteet eivät mene negatiivisiksi ja Selviytyjässä on aina ≥ 1 elossa', () => {
    fc.assert(
      fc.property(planArb, fc.integer({ min: 2, max: 8 }), fc.integer(), fc.integer(), (plan, n, seed, inputSeed) => {
        playThrough(game(plan, n, seed), randomPicker, inputSeed, (g) => {
          for (const p of Object.values(g.players)) {
            expect(p.score).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(p.score)).toBe(true);
          }
          expect(Object.values(g.players).some((p) => p.alive)).toBe(true);
        });
      }),
      { numRuns: 150 },
    );
  });

  it('julkinen näkymä ei koskaan sisällä oikeaa vastausta kysymysvaiheessa', () => {
    fc.assert(
      fc.property(planArb, fc.integer(), (plan, seed) => {
        playThrough(game(plan, 4, seed), randomPicker, seed, (g) => {
          if (!g.phase?.input) return;
          const view = JSON.stringify(g.phase.view);
          expect(view).not.toMatch(/"correct"|"answer"|"truth"|"authors"/);
        });
      }),
      { numRuns: 80 },
    );
  });
});
