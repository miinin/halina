/**
 * Moninpeli ilman Firebasea: artifactin `room`-kanava (claude.ai).
 *
 * - Host lähettää koko julkisen tilan (vaihe, pelaajat, palautteet) aiheella `st`,
 *   pilkottuna alle 4 KiB:n paloihin, aina muutoksen jälkeen ja varmuudeksi 2 s välein
 *   (viestit voivat kadota, myöhään liittyvä saa tilan seuraavalla kierroksella).
 * - Pelaajat eivät lähetä viestejä vaan pitävät omaa `presence`-tilaansa ajan tasalla:
 *   {cid, name, avatar, inp: {s: vaihe, v: vastaus}}. Presence toimii myös pelkillä
 *   katseluoikeuksilla, ja alusta jakaa sen uusille ja uudelleen yhdistäville.
 */
import type { PlayerRow, StateRow } from '../lib/shared.ts';

export const STATE_TOPIC = 'st';
const CHUNK_CHARS = 1200;

/** Pieni osa room-rajapinnasta, jota tarvitaan (tyypit: room.d.ts). */
export interface RoomPeer {
  peer: string;
  isMe: boolean;
  presence: Readonly<Record<string, unknown>>;
}
export interface NamedRoomLike {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, handler: (msg: { peer: string; isMe: boolean; data?: unknown }) => void, onError?: (e: { code: string }) => void): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(handler: (c: { peers: readonly RoomPeer[]; joined: readonly RoomPeer[]; left: readonly RoomPeer[] }) => void, onError?: (e: { code: string }) => void): () => void;
  connected(): boolean;
  leave(): Promise<void>;
}
export interface RoomLike {
  join(name: string): Promise<NamedRoomLike>;
}

export interface Broadcast {
  /** hostin istunto: vaihtuu, jos host lataa sivun uudelleen */
  h: string;
  v: number;
  hostNow: number;
  code: string;
  state: StateRow;
  roster: Record<string, PlayerRow>;
  feedback: Record<string, string>;
  kicked: string[];
}

export interface PlayerPresence {
  cid: string;
  name: string;
  avatar: string;
  inp: { s: string; v: unknown } | null;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

let roomPromise: Promise<RoomLike | null> | null = null;

/** `null`, kun sivu ei ole claude.ai-artifactina tai kanava ei ole käytössä. */
export function getRoom(): Promise<RoomLike | null> {
  roomPromise ??= (async () => {
    try {
      if (!window.claude?.use) return null;
      return ((await window.claude.use('room')) as RoomLike | null) ?? null;
    } catch {
      return null;
    }
  })();
  return roomPromise;
}

export const roomName = (code: string) => `halina-${code.toLowerCase()}`;

/** Pysyvä pelaajatunnus tälle selaimelle (sivun päivitys palauttaa samaan paikkaan). */
export function clientId(): string {
  const key = 'halina.cid';
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const id = 'p' + crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12);
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'p' + Math.floor(Math.random() * 1e12);
  }
}

export async function sendState(room: NamedRoomLike, b: Broadcast) {
  const json = JSON.stringify(b);
  const n = Math.ceil(json.length / CHUNK_CHARS);
  for (let i = 0; i < n; i++) {
    await room.emit(STATE_TOPIC, { h: b.h, v: b.v, i, n, d: json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) });
  }
}

/** Kokoaa palat; kutsuu `onState` jokaisesta valmiista, uudemmasta tilasta. */
export function receiveState(room: NamedRoomLike, onState: (b: Broadcast, peer: string) => void) {
  let parts: { key: string; got: (string | undefined)[] } | null = null;
  let last = { h: '', v: -1 };
  return room.on(STATE_TOPIC, (msg) => {
    const m = msg.data as { h: string; v: number; i: number; n: number; d: string } | undefined;
    if (!m || typeof m.d !== 'string' || !(m.n > 0) || m.n > 64) return;
    if (m.h === last.h && m.v <= last.v) return;
    const key = `${msg.peer}:${m.h}:${m.v}`;
    if (parts?.key !== key) parts = { key, got: new Array(m.n) };
    parts.got[m.i] = m.d;
    if (parts.got.filter((x) => x !== undefined).length !== m.n) return;
    try {
      const b = JSON.parse(parts.got.join('')) as Broadcast;
      last = { h: m.h, v: m.v };
      parts = null;
      onState(b, msg.peer);
    } catch {
      parts = null;
    }
  });
}
