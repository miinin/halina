import { useEffect, useMemo, useRef, useState } from 'react';
import { firebase, signIn, storage } from '../lib/firebase.ts';
import { t } from '../i18n/fi.ts';
import { Button } from '../components/ui.tsx';
import { HostController } from './controller.ts';
import { Lobby } from './Lobby.tsx';
import { Stage } from './Stage.tsx';
import { Controls } from './Controls.tsx';
import { useHostSounds } from './sounds.ts';

interface SavedRoom {
  code: string;
  createdAt: number;
}

export default function HostApp() {
  const fb = useMemo(() => firebase('host'), []);
  const store = useMemo(() => storage(fb), [fb]);
  const [uid, setUid] = useState<string | null>(null);
  const [ctrl, setCtrl] = useState<HostController | null>(null);
  const [resumable, setResumable] = useState<SavedRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const id = await signIn(fb);
        setUid(id);
        const rooms = await HostController.cleanup(fb.db, id, store.get<SavedRoom[]>('rooms') ?? []);
        store.set('rooms', rooms);
        const last = store.get<SavedRoom>('current');
        if (last && rooms.some((r) => r.code === last.code)) setResumable(last);
        else await create(id);
      } catch (e) {
        setError(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // näyttö ei sammu kesken pelin
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        /* ei tuettu */
      }
    };
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);

  async function create(id = uid!) {
    setBusy(true);
    try {
      const c = await HostController.create(fb.db, id);
      const room = { code: c.code, createdAt: Date.now() };
      store.set('rooms', [...(store.get<SavedRoom[]>('rooms') ?? []), room]);
      store.set('current', room);
      setResumable(null);
      setCtrl(c);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resume(room: SavedRoom) {
    setBusy(true);
    const c = await HostController.resume(fb.db, uid!, room.code).catch(() => null);
    setBusy(false);
    if (c) {
      setResumable(null);
      setCtrl(c);
    } else {
      await create();
    }
  }

  useEffect(() => () => ctrl?.dispose(), [ctrl]);

  if (error) return <div className="grid h-full place-items-center p-8 text-bad">{error}</div>;
  if (resumable && !ctrl)
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-5xl font-black">{t.appName}</h1>
          <Button disabled={busy} onClick={() => resume(resumable)} className="text-2xl">
            {t.host.resume(resumable.code)}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => create()}>
            {t.host.newRoom}
          </Button>
        </div>
      </div>
    );
  if (!ctrl) return <div className="grid h-full place-items-center text-2xl text-white/70">{t.host.creating}</div>;
  return <HostRoom ctrl={ctrl} />;
}

function useCtrl(ctrl: HostController) {
  const [, force] = useState(0);
  useEffect(() => {
    const off = ctrl.subscribe(() => force((x) => x + 1));
    return () => void off();
  }, [ctrl]);
}

function HostRoom({ ctrl }: { ctrl: HostController }) {
  useCtrl(ctrl);
  useHostSounds(ctrl);
  // dev: testit ja botit voivat tarkastella hostin tilaa
  if (import.meta.env.DEV) (window as any).__halinaHost = ctrl;
  const inGame = !!ctrl.game && ctrl.state?.stage !== 'lobby';
  return (
    <div className="flex h-full min-h-screen flex-col">
      {inGame ? (
        <>
          <Stage ctrl={ctrl} />
          <Controls ctrl={ctrl} />
        </>
      ) : (
        <Lobby ctrl={ctrl} />
      )}
      {ctrl.error && <div className="fixed bottom-2 left-2 rounded bg-bad px-3 py-1 text-sm">{ctrl.error}</div>}
    </div>
  );
}
