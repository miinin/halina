/**
 * Bottipelaajat paikalliseen testaukseen (vain emulaattoria vasten).
 *
 *   npm run bots -- --room KDRT --count 8 --accuracy 0.6
 *
 * Jokainen botti on oma anonyymi käyttäjänsä ja kirjoittaa syötteensä tavallisen asiakkaan
 * tavoin, joten tietoturvasäännöt ovat voimassa. Osumatarkkuutta varten botit kurkkaavat
 * oikean vastauksen emulaattorin REST-rajapinnasta "owner"-tunnuksella (ei mahdollista tuotannossa).
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectDatabaseEmulator,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  type Database,
} from 'firebase/database';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);

const ROOM = String(args.room ?? '').toUpperCase();
const COUNT = Number(args.count ?? 4);
const ACCURACY = Number(args.accuracy ?? 0.6);
const HOST = String(args.host ?? '127.0.0.1');
const SPEED = Number(args.speed ?? 1); // vastausviiveen kerroin
const NS = 'demo-halina-default-rtdb';

if (!/^[A-Z]{4}$/.test(ROOM)) {
  console.error('Käyttö: npm run bots -- --room ABCD [--count 8] [--accuracy 0.6] [--host 127.0.0.1]');
  process.exit(1);
}

const NAMES = ['Botti-Bertta', 'Robo-Raimo', 'Kone-Kaija', 'Piiri-Pekka', 'Datta-Liisa', 'Sähkö-Sami', 'Bitti-Briitta', 'Algo-Aatu', 'Servo-Senja', 'Tera-Tapsa', 'Giga-Göran', 'Nano-Nelli'];
const AVATARS = ['fox', 'cat', 'dog', 'bear', 'panda', 'frog', 'owl', 'penguin', 'octopus', 'unicorn', 'tiger', 'monkey'];
const LIES = ['saunakiukaan', 'pullaa', 'hirven', 'Nokia 3310', 'karvalakki', 'mämmiä', 'kalakukko', 'lumilapio', 'kumisaappaat', 'sisu', 'muumimuki', 'salmiakki', 'porokoira', 'tervapulla'];

interface StateRow {
  stepKey: string;
  input: string | null;
  durationMs: number;
  deadline: number;
  paused: boolean;
  data: string;
}

async function peekAnswer(step: string): Promise<unknown> {
  try {
    const r = await fetch(`http://${HOST}:9000/hostOnly/${ROOM}/answerKey.json?ns=${NS}`, {
      headers: { Authorization: 'Bearer owner' },
    });
    const k = (await r.json()) as { stepKey: string; value: string } | null;
    return k?.stepKey === step ? JSON.parse(k.value) : null;
  } catch {
    return null;
  }
}

const rand = (n: number) => Math.floor(Math.random() * n);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decide(kind: string, view: any, uid: string, score: number, answer: unknown): unknown {
  const smart = Math.random() < ACCURACY;
  switch (kind) {
    case 'mc':
      return smart && typeof answer === 'number' ? answer : rand((view.options as string[]).length);
    case 'wager': {
      if (score < 500 && Math.random() < 0.5) return 500;
      const r = Math.random();
      return r < 0.15 ? score : Math.round(score * Math.random() * 0.7);
    }
    case 'number': {
      if (typeof answer === 'number') {
        const spread = smart ? 0.15 : 0.8;
        const v = answer * (1 + (Math.random() * 2 - 1) * spread);
        return Math.abs(answer) < 100 ? Math.round(v * 10) / 10 : Math.round(v);
      }
      return rand(1000);
    }
    case 'text':
      return LIES[rand(LIES.length)] + (Math.random() < 0.3 ? ` ${rand(100)}` : '');
    case 'choice': {
      const opts = view.options as { id: string }[];
      if (smart && typeof answer === 'string') return answer;
      return opts[rand(opts.length)].id;
    }
    case 'door':
      return rand(3);
    case 'math':
      return smart && Array.isArray(answer) ? answer : [rand(100), rand(100), rand(100)];
    case 'vote': {
      const others = (view.cellar as string[]).filter((u) => u !== uid);
      return others[rand(others.length)];
    }
    case 'bet':
      return Math.random() < 0.5 ? view.a : view.b;
    default:
      return null;
  }
}

function inAudience(a: unknown, uid: string, alive: boolean) {
  return a === 'all' ? true : a === 'alive' ? alive : Array.isArray(a) && a.includes(uid);
}

async function startBot(i: number) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-halina', databaseURL: `https://${NS}.firebaseio.com` }, `bot-${i}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const db: Database = getDatabase(app);
  connectDatabaseEmulator(db, HOST, 9000);
  const { user } = await signInAnonymously(auth);
  const uid = user.uid;
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? i : '');
  const me = `rooms/${ROOM}/players/${uid}`;
  await set(ref(db, me), { name: name.slice(0, 12), avatar: AVATARS[i % AVATARS.length], score: 0, alive: true, connected: true, joinedAt: serverTimestamp() });
  await onDisconnect(ref(db, `${me}/connected`)).set(false);
  console.log(`🤖 ${name} liittyi (${uid.slice(0, 6)})`);

  let score = 0;
  let alive = true;
  onValue(ref(db, me), (s) => {
    score = s.child('score').val() ?? 0;
    alive = s.child('alive').val() ?? true;
  });

  let handled = '';
  onValue(ref(db, `rooms/${ROOM}/state`), async (snap) => {
    const s = snap.val() as StateRow | null;
    if (!s?.input || s.paused || handled === s.stepKey) return;
    const { view, audience } = JSON.parse(s.data);
    if (!inAudience(audience, uid, alive)) return;
    handled = s.stepKey;
    const step = s.stepKey;
    const delay = (800 + Math.random() * Math.max(500, s.durationMs * 0.5)) * SPEED;
    await sleep(Math.min(delay, Math.max(0, s.durationMs - 1500)));
    const answer = await peekAnswer(step);
    const value = decide(s.input, view, uid, score, answer);
    if (value === null || value === undefined) return;
    await set(ref(db, `rooms/${ROOM}/inputs/${step}/${uid}`), { value, at: serverTimestamp() }).catch(() => {});
  });
}

console.log(`Liitetään ${COUNT} bottia huoneeseen ${ROOM} (osumatarkkuus ${ACCURACY})…`);
for (let i = 0; i < COUNT; i++) await startBot(i);
console.log('Botit pelaavat. Lopeta Ctrl+C.');
