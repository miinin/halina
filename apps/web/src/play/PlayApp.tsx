import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ref, serverTimestamp, set, type Database } from 'firebase/database';
import { firebase, signIn, storage } from '../lib/firebase.ts';
import { serverClock, useValue } from '../lib/hooks.ts';
import { AVATAR_IDS, joinRoom, normalizeCode, paths, trackPresence, type Meta, type PlayerRow, type StateRow } from '../lib/room.ts';
import { t } from '../i18n/fi.ts';
import { Avatar, Button } from '../components/ui.tsx';
import { PlayerScreen } from './PlayerScreen.tsx';

export default function PlayApp() {
  const fb = useMemo(() => firebase('player'), []);
  const store = useMemo(() => storage(fb), [fb]);
  const [uid, setUid] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      const id = await signIn(fb);
      setUid(id);
      // automaattinen paluu samaan huoneeseen (sivun päivitys / yhteyskatko)
      const urlCode = normalizeCode(new URLSearchParams(location.search).get('code') ?? '');
      const saved = store.get<string>('room');
      const candidate = urlCode.length === 4 ? urlCode : saved;
      if (candidate && candidate === saved) {
        const me = store.get<{ name: string; avatar: string }>('me');
        if (me) {
          const r = await joinRoom(fb.db, id, candidate, me.name, me.avatar);
          if (r.ok) setCode(candidate);
          else store.set('room', null);
        }
      }
      setChecking(false);
    })();
  }, [fb, store]);

  if (!uid || checking) return <Center>{t.common.loading}</Center>;
  if (!code)
    return (
      <JoinForm
        db={fb.db}
        uid={uid}
        initial={store.get<{ name: string; avatar: string }>('me')}
        onJoined={(c, me) => {
          store.set('room', c);
          store.set('me', me);
          setCode(c);
        }}
      />
    );
  return (
    <PlayerGame
      db={fb.db}
      uid={uid}
      code={code}
      onLeave={() => {
        store.set('room', null);
        setCode(null);
      }}
    />
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid min-h-full place-items-center p-6 text-center text-lg text-white/80">{children}</div>;
}

// ---------- liittyminen ----------

function JoinForm({
  db,
  uid,
  initial,
  onJoined,
}: {
  db: Database;
  uid: string;
  initial: { name: string; avatar: string } | null;
  onJoined: (code: string, me: { name: string; avatar: string }) => void;
}) {
  const [code, setCode] = useState(normalizeCode(new URLSearchParams(location.search).get('code') ?? ''));
  const [name, setName] = useState(initial?.name ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 1 || n.length > 12) return setError(t.join.nameRequired);
    setBusy(true);
    setError(null);
    const r = await joinRoom(db, uid, code, n, avatar);
    setBusy(false);
    if (r.ok) onJoined(code, { name: n, avatar });
    else setError(r.error === 'not-found' ? t.join.notFound : r.error === 'kicked' ? t.join.kicked : t.join.error);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 py-8">
      <h1 className="text-center text-4xl font-black">{t.join.title}</h1>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-white/70">{t.join.code}</span>
          <input
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            className="h-16 rounded-xl bg-white px-4 text-center text-4xl font-black tracking-[0.4em] text-ink uppercase"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-white/70">{t.join.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 12))}
            maxLength={12}
            autoComplete="nickname"
            className="h-14 rounded-xl bg-white px-4 text-2xl font-bold text-ink"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-white/70">{t.join.avatar}</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {AVATAR_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-label={id}
                aria-pressed={avatar === id}
                onClick={() => setAvatar(id)}
                className={`grid aspect-square min-h-11 place-items-center rounded-lg border-2 ${avatar === id ? 'border-accent' : 'border-transparent'}`}
              >
                <Avatar id={id} name={name} size="sm" />
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p className="rounded-xl bg-bad/20 p-3 font-semibold text-bad">{error}</p>}
        <Button type="submit" disabled={busy || code.length !== 4 || !name.trim()} className="text-xl">
          {t.join.submit}
        </Button>
      </form>
    </main>
  );
}

function PlayerGame({ db, uid, code, onLeave }: { db: Database; uid: string; code: string; onLeave: () => void }) {
  const meta = useValue<Meta>(db, paths.meta(code));
  const state = useValue<StateRow>(db, paths.state(code));
  const players = useValue<Record<string, PlayerRow>>(db, paths.players(code)) ?? {};
  const kicked = useValue<boolean>(db, paths.kicked(code, uid));
  const step = state?.stepKey ?? 'lobby';
  const myInput = useValue<{ value: unknown }>(db, state?.input ? paths.input(code, step, uid) : null);
  const feedback = useValue<{ stepKey: string; reason: keyof typeof t.reject }>(db, paths.feedback(code, uid));
  const clock = useMemo(() => serverClock(db).now, [db]);

  useEffect(() => trackPresence(db, paths.player(code, uid)), [db, code, uid]);

  const me = players[uid];

  if (kicked) {
    return (
      <Center>
        <div className="flex flex-col gap-4">
          <p>{t.play.kickedOut}</p>
          <Button onClick={onLeave}>{t.play.leave}</Button>
        </div>
      </Center>
    );
  }
  if (meta === null) {
    return (
      <Center>
        <div className="flex flex-col gap-4">
          <p>{t.join.notFound}</p>
          <Button onClick={onLeave}>{t.play.leave}</Button>
        </div>
      </Center>
    );
  }
  if (!state || !me) return <Center>{t.common.loading}</Center>;

  const sent = myInput?.value;
  const send = (value: unknown) => {
    void set(ref(db, paths.input(code, step, uid)), { value, at: serverTimestamp() }).catch(() => {});
  };
  const error = feedback && feedback.stepKey === step ? t.reject[feedback.reason] : null;

  return (
    <PlayerScreen
      uid={uid}
      code={code}
      me={me}
      players={players}
      state={state}
      sent={sent}
      error={error}
      send={send}
      clock={clock}
      hostAway={meta?.hostConnected === false}
    />
  );
}
