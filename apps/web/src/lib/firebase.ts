import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';

declare const __LAN_ORIGIN__: string;
export const LAN_ORIGIN = __LAN_ORIGIN__;

export const USE_EMULATORS = import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true';

const emulatorConfig = {
  apiKey: 'demo-key',
  authDomain: 'demo-halina.firebaseapp.com',
  projectId: 'demo-halina',
  databaseURL: 'https://demo-halina-default-rtdb.firebaseio.com',
  appId: 'demo-app',
};

const prodConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export type Role = 'host' | 'player';

/** dev-buildissa ?devPlayer=N antaa jokaiselle välilehdelle oman pelaajatunnuksen */
export function devPlayer(): string | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(location.search).get('devPlayer');
}

export interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
  /** localStorage-avainten etuliite tälle identiteetille */
  key: string;
}

const cache = new Map<string, Fb>();

/**
 * Host ja pelaaja käyttävät eri Firebase-sovellusinstansseja, joten samalla selaimella voi
 * testata molempia. Anonyymi tunnus tallentuu sovelluksen nimellä.
 */
export function firebase(role: Role): Fb {
  const dp = role === 'player' ? devPlayer() : null;
  const name = role === 'host' ? 'host' : dp ? `player-${dp}` : 'player';
  const hit = cache.get(name);
  if (hit) return hit;
  const app = getApps().find((a) => a.name === name) ?? initializeApp(USE_EMULATORS ? emulatorConfig : prodConfig, name);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (USE_EMULATORS) {
    const host = location.hostname || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(db, host, 9000);
  }
  const fb = { app, auth, db, key: `halina.${name}` };
  cache.set(name, fb);
  return fb;
}

export async function signIn(fb: Fb): Promise<string> {
  await fb.auth.authStateReady();
  if (fb.auth.currentUser) return fb.auth.currentUser.uid;
  const cred = await signInAnonymously(fb.auth);
  return cred.user.uid;
}

export function storage(fb: Fb) {
  return {
    get<T>(k: string): T | null {
      try {
        const v = localStorage.getItem(`${fb.key}.${k}`);
        return v ? (JSON.parse(v) as T) : null;
      } catch {
        return null;
      }
    },
    set(k: string, v: unknown) {
      try {
        if (v === null) localStorage.removeItem(`${fb.key}.${k}`);
        else localStorage.setItem(`${fb.key}.${k}`, JSON.stringify(v));
      } catch {
        /* yksityinen ikkuna tms. */
      }
    },
  };
}
