import type { Audience, InputKind, PhaseView } from '@halina/engine';

/** Firebase-vapaat tyypit ja apurit (käytössä myös demossa). */
/** Pelaajan tunnusväri (vanhat id:t säilyvät, jotta tallennetut valinnat toimivat). */
export const AVATARS: Record<string, string> = {
  fox: '#d9623b', cat: '#c9a227', dog: '#8c6d4f', bear: '#6b8f3a', panda: '#4f9d8f', frog: '#3f8fc9', owl: '#6f6bd1', penguin: '#a65fb5',
  octopus: '#c2527a', unicorn: '#d48aa5', tiger: '#e08e2b', monkey: '#7a8a99', hedgehog: '#5c7c5a', koala: '#4c6fa0', chick: '#b8b04a', whale: '#2f8f9d',
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

