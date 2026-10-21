import { get, onDisconnect, onValue, ref, serverTimestamp, set, update, type Database } from 'firebase/database';
import type { Uid } from '@halina/engine';

export * from './codes.ts';
import { randomCode } from './codes.ts';
export const ROOM_TTL_MS = 24 * 3600_000;

export * from './shared.ts';
import type { StateRow } from './shared.ts';

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
