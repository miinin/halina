import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set, update } from 'firebase/database';

let env: RulesTestEnvironment;
const CODE = 'KDRT';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-halina',
    database: { rules: readFileSync('firebase/database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
afterAll(() => env.cleanup());

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database());

async function seedRoom(phase: { stepKey: string; paused?: boolean; deadline?: number } = { stepKey: 's1' }) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.database();
    await set(ref(d), {
      codes: { [CODE]: { hostUid: 'host', createdAt: Date.now() } },
      rooms: {
        [CODE]: {
          meta: { hostUid: 'host', status: 'playing' },
          state: { stepKey: phase.stepKey, paused: phase.paused ?? false, deadline: phase.deadline ?? Date.now() + 30_000 },
          players: { alice: { name: 'Alice', avatar: 'fox', score: 100, alive: true, connected: true } },
        },
      },
      hostOnly: { [CODE]: { answerKey: { s1: 2 } } },
    });
  });
}

beforeEach(async () => {
  await env.clearDatabase();
  await seedRoom();
});

describe('huonekoodit', () => {
  it('vapaan koodin voi varata itselleen', async () => {
    await assertSucceeds(set(ref(db('h2'), 'codes/ABCD'), { hostUid: 'h2', createdAt: serverTimestamp() }));
  });
  it('varattua koodia ei voi viedä', async () => {
    await assertFails(set(ref(db('h2'), `codes/${CODE}`), { hostUid: 'h2', createdAt: serverTimestamp() }));
  });
  it('yli 24 h vanhan koodin voi varata uudelleen', async () => {
    await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'codes/WXYZ'), { hostUid: 'old', createdAt: Date.now() - 25 * 3600_000 }));
    await assertSucceeds(set(ref(db('h2'), 'codes/WXYZ'), { hostUid: 'h2', createdAt: serverTimestamp() }));
  });
  it('koodissa ei saa olla sekoittuvia kirjaimia', async () => {
    await assertFails(set(ref(db('h2'), 'codes/ABCO'), { hostUid: 'h2', createdAt: serverTimestamp() }));
  });
  it('kirjautumaton ei voi lukea', async () => {
    await assertFails(get(ref(db(null), `codes/${CODE}`)));
  });
});

describe('huone', () => {
  it('kaikki kirjautuneet lukevat tilan, vain host kirjoittaa', async () => {
    await assertSucceeds(get(ref(db('bob'), `rooms/${CODE}/state`)));
    await assertFails(set(ref(db('bob'), `rooms/${CODE}/state/phase`), 'hacked'));
    await assertSucceeds(set(ref(db('host'), `rooms/${CODE}/state/phase`), 'reveal'));
  });
  it('salaista tilaa lukee vain host', async () => {
    await assertFails(get(ref(db('alice'), `hostOnly/${CODE}`)));
    await assertSucceeds(get(ref(db('host'), `hostOnly/${CODE}`)));
  });
});

describe('pelaajat', () => {
  it('pelaaja luo oman rivinsä nollapisteillä', async () => {
    await assertSucceeds(
      set(ref(db('bob'), `rooms/${CODE}/players/bob`), { name: 'Bob', avatar: 'cat', score: 0, alive: true, connected: true }),
    );
  });
  it('pelaaja ei voi antaa itselleen pisteitä', async () => {
    await assertFails(
      set(ref(db('bob'), `rooms/${CODE}/players/bob`), { name: 'Bob', avatar: 'cat', score: 5000, alive: true }),
    );
    await assertFails(update(ref(db('alice'), `rooms/${CODE}/players/alice`), { score: 9999 }));
    await assertSucceeds(update(ref(db('alice'), `rooms/${CODE}/players/alice`), { name: 'Liisa', connected: false }));
  });
  it('toisen pelaajan riviä ei voi muokata', async () => {
    await assertFails(update(ref(db('bob'), `rooms/${CODE}/players/alice`), { name: 'Hölmö' }));
  });
  it('nimi 1–12 merkkiä', async () => {
    await assertFails(set(ref(db('bob'), `rooms/${CODE}/players/bob`), { name: 'x'.repeat(13), avatar: 'cat', score: 0, alive: true }));
    await assertFails(set(ref(db('bob'), `rooms/${CODE}/players/bob`), { name: '', avatar: 'cat', score: 0, alive: true }));
  });
  it('poistettu pelaaja ei voi palata', async () => {
    await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), `rooms/${CODE}/kicked/bob`), true));
    await assertFails(set(ref(db('bob'), `rooms/${CODE}/players/bob`), { name: 'Bob', avatar: 'cat', score: 0, alive: true }));
  });
  it('host voi asettaa pisteet ja poistaa pelaajan', async () => {
    await assertSucceeds(update(ref(db('host'), `rooms/${CODE}/players/alice`), { score: 1234, alive: false }));
    await assertSucceeds(remove(ref(db('host'), `rooms/${CODE}/players/alice`)));
  });
});

describe('syötteet', () => {
  const input = (v: unknown) => ({ value: v, at: serverTimestamp() });

  it('pelaaja kirjoittaa omaan syötteeseensä nykyisessä vaiheessa', async () => {
    await assertSucceeds(set(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`), input(2)));
  });
  it('ei toisen puolesta', async () => {
    await assertFails(set(ref(db('bob'), `rooms/${CODE}/inputs/s1/alice`), input(2)));
  });
  it('ei vanhaan vaiheeseen', async () => {
    await assertFails(set(ref(db('alice'), `rooms/${CODE}/inputs/s0/alice`), input(2)));
  });
  it('ei tauolla', async () => {
    await seedRoom({ stepKey: 's1', paused: true });
    await assertFails(set(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`), input(2)));
  });
  it('ei aikarajan jälkeen (1 s armonaika)', async () => {
    await seedRoom({ stepKey: 's1', deadline: Date.now() - 5000 });
    await assertFails(set(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`), input(2)));
  });
  it('aikaleima tulee palvelimelta', async () => {
    await assertFails(set(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`), { value: 2, at: 1 }));
  });
  it('vapaateksti enintään 60 merkkiä', async () => {
    await assertFails(set(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`), input('x'.repeat(61))));
  });
  it('muut eivät näe toistensa syötteitä, host näkee', async () => {
    await set(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`), input('salainen bluffi'));
    await assertFails(get(ref(db('bob'), `rooms/${CODE}/inputs/s1/alice`)));
    await assertFails(get(ref(db('bob'), `rooms/${CODE}/inputs/s1`)));
    await assertSucceeds(get(ref(db('alice'), `rooms/${CODE}/inputs/s1/alice`)));
    await assertSucceeds(get(ref(db('host'), `rooms/${CODE}/inputs/s1`)));
  });
  it('liittymätön ei voi vastata', async () => {
    await assertFails(set(ref(db('mallory'), `rooms/${CODE}/inputs/s1/mallory`), input(1)));
  });
});
