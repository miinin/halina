import { get, onDisconnect, onValue, ref, serverTimestamp, set, update, type Database } from 'firebase/database';
import type { Audience, InputKind, PhaseView, Uid } from '@halina/engine';

/** 22 kirjainta: O, I, L ja Q poistettu → 22⁴ ≈ 234 000 koodia */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPRSTUVWXYZ';
export const CODE_RE = /^[A-HJKMNPR-Z]{4}$/;
export const ROOM_TTL_MS = 24 * 3600_000;

export function randomCode(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return [...a].map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export const AVATARS: Record<string, string> = {
  fox: '🦊', cat: '🐱', dog: '🐶', bear: '🐻', panda: '🐼', frog: '🐸', owl: '🦉', penguin: '🐧',
  octopus: '🐙', unicorn: '🦄', tiger: '🐯', monkey: '🐵', hedgehog: '🦔', koala: '🐨', chick: '🐥', whale: '🐳',
};
export const AVATAR_IDS = Object.keys(AVATARS);

export interface PlayerRow {
  name: string;
  avatar: string;
  score: number;
  alive: boolean;
  connected?: boolean;
  joinedAt?: number;
}

export interface Meta {
  hostUid: string;
  status: 'lobby' | 'playing' | 'finished';
  createdAt: number;
  hostConnected?: boolean;
}

/** rooms/$code/state – julkinen vaihe. view ja audience JSON-merkkijonona (RTDB hukkaa tyhjät taulukot). */
export interface StateRow {
  stepKey: string;
  stage: 'lobby' | 'intro' | 'round' | 'scoreboard' | 'podium';
  round: number;
  mode: string | null;
  phase: string;
  input: InputKind | null;
  startedAt: number;
  deadline: number;
  durationMs: number;
  paused: boolean;
  remainingMs: number;
  data: string;
}

export interface PublicPhase {
  view: PhaseView;
  audience: Audience;
}

export function parsePhase(s: StateRow | null): PublicPhase {
  if (!s?.data) return { view: { kind: 'lobby' }, audience: 'all' };
  try {
    return JSON.parse(s.data) as PublicPhase;
  } catch {
    return { view: { kind: 'lobby' }, audience: 'all' };
  }
}

export function lobbyState(): StateRow {
  return {
    stepKey: 'lobby',
    stage: 'lobby',
    round: -1,
    mode: null,
    phase: 'lobby',
    input: null,
    startedAt: 0,
    deadline: 0,
    durationMs: 0,
    paused: false,
    remainingMs: 0,
    data: JSON.stringify({ view: { kind: 'lobby' }, audience: 'all' }),
  };
}

export const paths = {
  code: (c: string) => `codes/${c}`,
  room: (c: string) => `rooms/${c}`,
  meta: (c: string) => `rooms/${c}/meta`,
  state: (c: string) => `rooms/${c}/state`,
  progress: (c: string) => `rooms/${c}/progress`,
  players: (c: string) => `rooms/${c}/players`,
  player: (c: string, uid: Uid) => `rooms/${c}/players/${uid}`,
  kicked: (c: string, uid: Uid) => `rooms/${c}/kicked/${uid}`,
  inputs: (c: string, step: string) => `rooms/${c}/inputs/${step}`,
  input: (c: string, step: string, uid: Uid) => `rooms/${c}/inputs/${step}/${uid}`,
  feedback: (c: string, uid: Uid) => `rooms/${c}/feedback/${uid}`,
  hostOnly: (c: string) => `hostOnly/${c}`,
};

/** Varaa vapaan (tai yli 24 h vanhan) koodin. Säännöt estävät törmäyksen toisen hostin kanssa. */
export async function reserveCode(db: Database, uid: string): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = randomCode();
    try {
      await set(ref(db, paths.code(code)), { hostUid: uid, createdAt: serverTimestamp() });
      return code;
    } catch {
      /* varattu – kokeillaan toista */
    }
  }
  throw new Error('Vapaata koodia ei löytynyt');
}

export type JoinError = 'not-found' | 'kicked' | 'error';

export async function joinRoom(
  db: Database,
  uid: string,
  code: string,
  name: string,
  avatar: string,
): Promise<{ ok: true } | { ok: false; error: JoinError }> {
  try {
    const meta = await get(ref(db, paths.meta(code)));
    if (!meta.exists()) return { ok: false, error: 'not-found' };
    if ((await get(ref(db, paths.kicked(code, uid)))).exists()) return { ok: false, error: 'kicked' };
    const me = await get(ref(db, paths.player(code, uid)));
    if (me.exists()) {
      await update(ref(db, paths.player(code, uid)), { name, avatar, connected: true });
    } else {
      await set(ref(db, paths.player(code, uid)), {
        name,
        avatar,
        score: 0,
        alive: true,
        connected: true,
        joinedAt: serverTimestamp(),
      });
    }
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'error' };
  }
}

/** Läsnäolo: yhteyden katketessa connected = false, palatessa true. Palauttaa lopetusfunktion. */
export function trackPresence(db: Database, path: string, field = 'connected'): () => void {
  return onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(ref(db, `${path}/${field}`))
      .set(false)
      .then(() => set(ref(db, `${path}/${field}`), true))
      .catch(() => {});
  });
}
