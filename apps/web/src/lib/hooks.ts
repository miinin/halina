import { useEffect, useState, useSyncExternalStore } from 'react';
import { onValue, ref, type Database } from 'firebase/database';

/** Kuuntelee yhtä polkua. undefined = ladataan, null = ei olemassa. */
export function useValue<T>(db: Database | null, path: string | null): T | null | undefined {
  const [v, setV] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!db || !path) {
      setV(undefined);
      return;
    }
    setV(undefined);
    return onValue(
      ref(db, path),
      (snap) => setV((snap.val() as T) ?? null),
      () => setV(null),
    );
  }, [db, path]);
  return v;
}

/** Palvelinajan offset (.info/serverTimeOffset) – ajastimet eivät luota laitteen kelloon. */
const offsets = new WeakMap<Database, { offset: number; subs: Set<() => void> }>();

export function serverClock(db: Database) {
  let entry = offsets.get(db);
  if (!entry) {
    const e = { offset: 0, subs: new Set<() => void>() };
    offsets.set(db, e);
    onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
      e.offset = Number(snap.val()) || 0;
      e.subs.forEach((f) => f());
    });
    entry = e;
  }
  return { now: () => Date.now() + entry!.offset };
}

/** Päivittyvä "nyt" palvelinajassa, oletuksena 10 kertaa sekunnissa. */
export function useServerNow(db: Database | null, intervalMs = 100): number {
  const clock = db ? serverClock(db) : { now: () => Date.now() };
  const [now, setNow] = useState(clock.now());
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), intervalMs);
    return () => clearInterval(id);
  }, [db, intervalMs]);
  return now;
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(q).matches,
  );
}
