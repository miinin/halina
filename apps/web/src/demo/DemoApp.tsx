import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PLAN_TEMPLATES } from '@halina/engine';
import { BUILTIN_PACKS } from '@halina/content';
import { t } from '../i18n/fi.ts';
import { AVATAR_IDS, parsePhase } from '../lib/shared.ts';
import { normalizeCode, randomCode } from '../lib/codes.ts';
import { Avatar, Button } from '../components/ui.tsx';
import { Stage } from '../host/Stage.tsx';
import { Controls } from '../host/Controls.tsx';
import { Lobby } from '../host/Lobby.tsx';
import { useHostSounds } from '../host/sounds.ts';
import { PlayerScreen, inAudience } from '../play/PlayerScreen.tsx';
import { DemoController, ME } from './DemoController.ts';
import { RoomHost } from './RoomHost.ts';
import { clientId, getRoom, receiveState, roomName, type Broadcast, type NamedRoomLike, type RoomLike } from './net.ts';

type Screen = 'home' | 'solo' | 'host' | 'join';

const TEMPLATE_PLANS = {
  quick: 'Perusvisa · Arvio · Bluffi · Panos',
  full: 'Perusvisa · Bluffi · Selviytyjä · Arvio · Kaksintaistelu · Panos',
  classroom: 'Perusvisa · Arvio · Selviytyjä',
} as const;

const gutter = { paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' };

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`halina.demo.${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(`halina.demo.${key}`, JSON.stringify(v));
  } catch {
    /* ei tallennusta */
  }
}

function useRoom() {
  const [room, setRoom] = useState<RoomLike | null | undefined>(undefined);
  useEffect(() => {
    void getRoom().then(setRoom);
  }, []);
  return room;
}

function useSubscribe(ctrl: { subscribe(fn: () => void): () => void }) {
  const [, force] = useState(0);
  useEffect(() => ctrl.subscribe(() => force((x) => x + 1)), [ctrl]);
}

export function DemoApp() {
  const room = useRoom();
  const [screen, setScreen] = useState<Screen>('home');
  const home = () => setScreen('home');
  if (screen === 'solo') return <Solo onExit={home} />;
  if (screen === 'host' && room) return <HostFlow room={room} onExit={home} />;
  if (screen === 'join' && room) return <JoinFlow room={room} onExit={home} />;
  return <Home room={room} onPick={setScreen} />;
}

// ---------- aloitus ----------

function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`font-display font-black tracking-tight ${small ? 'text-2xl' : 'text-6xl md:text-7xl'}`}>
      Hälinä<span className="text-accent">.</span>
    </span>
  );
}

function Home({ room, onPick }: { room: RoomLike | null | undefined; onPick: (s: Screen) => void }) {
  const multi = !!room;
  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-10 py-12" style={gutter}>
      <header className="flex max-w-2xl flex-col gap-4">
        <span className="eyebrow text-accent">Seurapelivisa · testiversio</span>
        <Wordmark />
        <p className="text-lg leading-relaxed text-paper/75">
          Yksi iso näyttö pyörittää peliä, pelaajat vastaavat omilla laitteillaan. Viisi pelimuotoa: Panos, Bluffi,
          Selviytyjä, Arvio ja Kaksintaistelu.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Choice
          eyebrow="Iso näyttö"
          title="Isännöi peliä"
          text="Avaa tämä läppärillä tai näytöllä. Saat koodin, jolla muut liittyvät."
          disabled={!multi}
          onClick={() => onPick('host')}
          primary
        />
        <Choice
          eyebrow="Puhelin"
          title="Liity peliin"
          text="Syötä isolla näytöllä näkyvä neljän kirjaimen koodi."
          disabled={!multi}
          onClick={() => onPick('join')}
        />
        <Choice
          eyebrow="Yksin"
          title="Kokeile bottien kanssa"
          text="Iso näyttö ja oma puhelinnäkymä rinnakkain, muut pelaajat ovat botteja."
          onClick={() => onPick('solo')}
        />
      </div>

      {room === null && (
        <p className="max-w-2xl rounded-lg border border-line bg-ink2/60 p-4 text-sm text-paper/70">
          Moninpeli käyttää claude.ai:n reaaliaikaista kanavaa, joka ei ole käytettävissä tässä näkymässä. Avaa sivu claude.ai:ssa
          kirjautuneena. Muut pelaajat tarvitsevat pääsyn tähän sivuun (jaa se sivun Share-valikosta).
        </p>
      )}
      {room === undefined && <p className="text-sm text-paper/50">Tarkistetaan moninpelin yhteyttä…</p>}
    </main>
  );
}

function Choice({
  eyebrow,
  title,
  text,
  onClick,
  disabled,
  primary,
}: {
  eyebrow: string;
  title: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col gap-3 rounded-xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'border-accent bg-accent text-ink' : 'border-line bg-ink2/70 hover:border-paper/40'
      }`}
    >
      <span className={`eyebrow ${primary ? 'text-ink/70' : 'text-paper/50'}`}>{eyebrow}</span>
      <span className="font-display text-2xl font-extrabold">{title}</span>
      <span className={`text-sm leading-relaxed ${primary ? 'text-ink/80' : 'text-paper/70'}`}>{text}</span>
      <span className="mt-auto pt-2 font-semibold">Aloita →</span>
    </button>
  );
}

function BackBar({ onExit, children }: { onExit: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3" style={gutter}>
      <button type="button" onClick={onExit} className="text-sm font-semibold text-paper/70 hover:text-paper">
        ← Alkuun
      </button>
      <Wordmark small />
      <div className="ml-auto">{children}</div>
    </div>
  );
}

function ColorPicker({ value, name, onChange }: { value: string; name: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-paper/70">{t.join.avatar}</legend>
      <div className="grid grid-cols-8 gap-1.5">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-label={`Väri ${id}`}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={`grid aspect-square min-h-10 place-items-center rounded-lg border-2 ${value === id ? 'border-accent' : 'border-transparent'}`}
          >
            <Avatar id={id} name={name} size="sm" />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const inputCls = 'h-12 w-full rounded-lg border border-line bg-paper px-4 text-lg font-semibold text-ink';

// ---------- yksin bottien kanssa ----------

function Solo({ onExit }: { onExit: () => void }) {
  const [ctrl, setCtrl] = useState<DemoController | null>(null);
  useEffect(() => () => ctrl?.dispose(), [ctrl]);
  if (!ctrl) return <SoloSetup onStart={setCtrl} onExit={onExit} />;
  return <SoloGame ctrl={ctrl} onExit={() => setCtrl(null)} />;
}

function SoloSetup({ onStart, onExit }: { onStart: (c: DemoController) => void; onExit: () => void }) {
  const [name, setName] = useState(() => store('name', 'Minä'));
  const [avatar, setAvatar] = useState(() => store('avatar', 'frog'));
  const [bots, setBots] = useState(5);
  const [template, setTemplate] = useState<(typeof PLAN_TEMPLATES)[number]['id']>('quick');
  const [speed, setSpeed] = useState(1);

  const start = () => {
    save('name', name.trim());
    save('avatar', avatar);
    const c = new DemoController({ me: { name: name.trim() || 'Minä', avatar }, bots });
    onStart(c);
    void c.start(PLAN_TEMPLATES.find((p) => p.id === template)!.plan, BUILTIN_PACKS[0], speed);
  };

  return (
    <div className="min-h-full">
      <BackBar onExit={onExit} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 py-8" style={gutter}>
        <div>
          <span className="eyebrow text-accent">Yksin</span>
          <h1 className="mt-2 text-3xl font-black">Kokeile bottien kanssa</h1>
        </div>
        <form
          className="grid gap-6 rounded-xl border border-line bg-ink2/60 p-5 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1" htmlFor="solo-name">
              <span className="text-sm font-semibold text-paper/70">{t.join.name}</span>
              <input id="solo-name" value={name} maxLength={12} onChange={(e) => setName(e.target.value.slice(0, 12))} className={inputCls} />
            </label>
            <ColorPicker value={avatar} name={name} onChange={setAvatar} />
            <label className="flex flex-col gap-1" htmlFor="solo-bots">
              <span className="text-sm font-semibold text-paper/70">Botteja: {bots}</span>
              <input id="solo-bots" type="range" min={2} max={7} value={bots} onChange={(e) => setBots(Number(e.target.value))} className="accent-[var(--color-accent)]" />
            </label>
          </div>
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold text-paper/70">{t.host.plan}</legend>
              {PLAN_TEMPLATES.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer flex-col rounded-lg border px-4 py-3 ${template === p.id ? 'border-accent bg-accent/10' : 'border-line'}`}
                >
                  <input type="radio" name="tpl" className="sr-only" checked={template === p.id} onChange={() => setTemplate(p.id)} />
                  <span className="font-semibold">
                    {t.templates[p.id]} <span className="tabular-nums text-sm text-paper/60">~{p.minutes} min</span>
                  </span>
                  <span className="text-sm text-paper/60">{TEMPLATE_PLANS[p.id]}</span>
                </label>
              ))}
            </fieldset>
            <SpeedPicker value={speed} onChange={setSpeed} />
          </div>
          <Button type="submit" className="text-lg md:col-span-2">
            Aloita peli
          </Button>
        </form>
      </main>
    </div>
  );
}

function SpeedPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Tahti</legend>
      <span className="text-sm font-semibold text-paper/70">Tahti</span>
      {[
        { id: 1, label: 'Normaali' },
        { id: 0.5, label: 'Nopea' },
      ].map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${value === s.id ? 'border-paper bg-paper text-ink' : 'border-line'}`}
        >
          {s.label}
        </button>
      ))}
    </fieldset>
  );
}

function SoloGame({ ctrl, onExit }: { ctrl: DemoController; onExit: () => void }) {
  useSubscribe(ctrl);
  useHostSounds(ctrl);
  const [tab, setTab] = useState<'stage' | 'phone'>('phone');
  const clock = useMemo(() => () => ctrl.now(), [ctrl]);
  const me = ctrl.roster[ME];
  const state = ctrl.state;

  useEffect(() => {
    if (!ctrl.game) onExit();
  });

  if (!ctrl.game || !state || !me) return null;
  const { audience } = parsePhase(state);
  const needsMe = !!state.input && inAudience(audience, ME, me.alive) && ctrl.inputs[ME] === undefined;
  const reason = ctrl.feedback(ME);

  return (
    <div className="flex h-full min-h-screen flex-col">
      <div className="flex gap-2 p-2 lg:hidden" role="tablist">
        {(['stage', 'phone'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative flex-1 rounded-lg border py-2 text-sm font-semibold ${tab === id ? 'border-paper bg-paper text-ink' : 'border-line'}`}
          >
            {id === 'stage' ? 'Iso näyttö' : 'Oma puhelin'}
            {id === 'phone' && needsMe && tab !== 'phone' && (
              <span className="absolute -top-1.5 right-2 rounded bg-accent px-1.5 text-xs text-ink">Vastaa</span>
            )}
          </button>
        ))}
      </div>
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className={`relative min-w-0 flex-col ${tab === 'stage' ? 'flex' : 'hidden'} lg:flex`} aria-label="Iso näyttö">
          <div className="flex flex-1 flex-col overflow-hidden [&_main]:min-h-0 [&_main]:px-4 [&_main]:pb-6 lg:[&_main]:px-8">
            <Stage ctrl={ctrl} />
          </div>
          <Controls ctrl={ctrl} navClass="sticky bottom-0 flex-wrap" />
        </section>
        <aside className={`${tab === 'phone' ? 'flex' : 'hidden'} min-w-0 justify-center border-line lg:flex lg:items-start lg:border-l lg:py-6`} aria-label="Oma puhelin">
          <div className="w-full max-w-md overflow-hidden lg:sticky lg:top-6 lg:h-[780px] lg:w-[370px] lg:rounded-[2rem] lg:border-[8px] lg:border-[#05090a] lg:bg-ink lg:shadow-2xl">
            <div className="h-full overflow-y-auto">
              <PlayerScreen
                uid={ME}
                code={ctrl.code}
                me={me}
                players={ctrl.roster}
                state={state}
                sent={ctrl.inputs[ME]?.value}
                error={reason ? t.reject[reason as keyof typeof t.reject] : null}
                send={(v) => ctrl.input(ME, v)}
                clock={clock}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------- moninpeli: host ----------

function HostFlow({ room, onExit }: { room: RoomLike; onExit: () => void }) {
  const [ctrl, setCtrl] = useState<RoomHost | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let c: RoomHost | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const code = randomCode();
        const named = await room.join(roomName(code));
        if (cancelled) return void named.leave();
        c = new RoomHost(named, code, 0);
        setCtrl(c);
      } catch (e) {
        setError((e as { code?: string }).code ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
      c?.dispose();
    };
  }, [room]);

  if (error)
    return (
      <div className="min-h-full">
        <BackBar onExit={onExit} />
        <p className="p-8 text-paper/80">Pelihuoneen avaaminen epäonnistui ({error}). Yritä hetken päästä uudelleen.</p>
      </div>
    );
  if (!ctrl) return <div className="grid h-full place-items-center text-paper/60">{t.host.creating}</div>;
  return <HostRoomView ctrl={ctrl} onExit={onExit} />;
}

function HostRoomView({ ctrl, onExit }: { ctrl: RoomHost; onExit: () => void }) {
  useSubscribe(ctrl);
  useHostSounds(ctrl);
  const bots = Object.keys(ctrl.roster).filter((u) => u.startsWith('bot')).length;
  const banner =
    ctrl.sendError === 'not_permitted'
      ? 'Sinulla ei ole oikeutta isännöidä tällä sivulla. Pyydä sivun omistajalta muokkausoikeus tai liity pelaajana.'
      : ctrl.sendError
        ? `Yhteysongelma (${ctrl.sendError}). Yritetään uudelleen.`
        : null;

  if (!ctrl.game) {
    return (
      <div className="min-h-full">
        <BackBar onExit={onExit} />
        {banner && <div className="bg-accent2 px-4 py-2 text-center font-semibold text-ink">{banner}</div>}
        <Lobby
          ctrl={ctrl}
          showSpeed
          joinPanel={
            <div className="flex flex-col gap-4 rounded-xl border border-line bg-ink2/60 p-6">
              <span className="eyebrow text-paper/60">Liittymiskoodi</span>
              <div className="font-mono text-7xl leading-none font-semibold tracking-[0.2em] text-accent md:text-8xl" data-testid="room-code">
                {ctrl.code}
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-paper/80">
                <li>Pelaajat avaavat tämän saman sivun omalla laitteellaan.</li>
                <li>
                  He valitsevat <b>Liity peliin</b> ja syöttävät koodin <b className="font-mono">{ctrl.code}</b>.
                </li>
              </ol>
            </div>
          }
          extraSettings={
            <label className="flex flex-col gap-1 text-sm text-paper/70" htmlFor="host-bots">
              Lisää botteja täytteeksi: {bots}
              <input
                id="host-bots"
                type="range"
                min={0}
                max={6}
                value={bots}
                onChange={(e) => ctrl.setBots(Number(e.target.value))}
                className="accent-[var(--color-accent)]"
              />
            </label>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-screen flex-col">
      {banner && <div className="bg-accent2 px-4 py-2 text-center font-semibold text-ink">{banner}</div>}
      <Stage ctrl={ctrl} />
      <Controls ctrl={ctrl} />
    </div>
  );
}

// ---------- moninpeli: pelaaja ----------

type JoinState = { phase: 'form'; error?: string } | { phase: 'connecting' } | { phase: 'in'; named: NamedRoomLike; code: string };

function JoinFlow({ room, onExit }: { room: RoomLike; onExit: () => void }) {
  const [code, setCode] = useState(() => store('code', ''));
  const [name, setName] = useState(() => store('name', ''));
  const [avatar, setAvatar] = useState(() => store('avatar', AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]));
  const [js, setJs] = useState<JoinState>({ phase: 'form' });

  const join = async () => {
    const n = name.trim();
    if (!n) return setJs({ phase: 'form', error: t.join.nameRequired });
    save('code', code);
    save('name', n);
    save('avatar', avatar);
    setJs({ phase: 'connecting' });
    try {
      const named = await room.join(roomName(code));
      setJs({ phase: 'in', named, code });
    } catch (e) {
      setJs({ phase: 'form', error: `${t.join.error} (${(e as { code?: string }).code ?? e})` });
    }
  };

  if (js.phase === 'in')
    return (
      <PlayerRoom
        named={js.named}
        code={js.code}
        name={name.trim()}
        avatar={avatar}
        onLeave={(error) => {
          void js.named.leave();
          setJs({ phase: 'form', error });
        }}
      />
    );

  return (
    <div className="min-h-full">
      <BackBar onExit={onExit} />
      <main className="mx-auto flex max-w-md flex-col gap-5 py-8" style={gutter}>
        <h1 className="text-3xl font-black">{t.join.title}</h1>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <label className="flex flex-col gap-1" htmlFor="join-code">
            <span className="text-sm font-semibold text-paper/70">{t.join.code}</span>
            <input
              id="join-code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-16 w-full rounded-lg border border-line bg-paper px-4 text-center font-mono text-4xl font-semibold tracking-[0.4em] text-ink uppercase"
            />
          </label>
          <label className="flex flex-col gap-1" htmlFor="join-name">
            <span className="text-sm font-semibold text-paper/70">{t.join.name}</span>
            <input id="join-name" value={name} maxLength={12} onChange={(e) => setName(e.target.value.slice(0, 12))} autoComplete="nickname" className={inputCls} />
          </label>
          <ColorPicker value={avatar} name={name} onChange={setAvatar} />
          {js.phase === 'form' && js.error && <p className="rounded-lg border border-bad/50 bg-bad/10 p-3 font-semibold text-bad">{js.error}</p>}
          <Button type="submit" disabled={js.phase === 'connecting' || code.length !== 4 || !name.trim()} className="text-lg">
            {js.phase === 'connecting' ? 'Yhdistetään…' : t.join.submit}
          </Button>
        </form>
      </main>
    </div>
  );
}

const HOST_TIMEOUT_MS = 8000;

function PlayerRoom({
  named,
  code,
  name,
  avatar,
  onLeave,
}: {
  named: NamedRoomLike;
  code: string;
  name: string;
  avatar: string;
  onLeave: (error?: string) => void;
}) {
  const cid = useMemo(() => clientId(), []);
  const [b, setB] = useState<Broadcast | null>(null);
  const [inp, setInp] = useState<{ s: string; v: unknown } | null>(null);
  const offset = useRef(0);
  const lastRecv = useRef(Date.now());
  const [, tick] = useState(0);

  useEffect(() => {
    void named.presence({ cid, name, avatar, inp: null }).catch(() => {});
    const off = receiveState(named, (msg) => {
      if (msg.code !== code) return;
      offset.current = msg.hostNow - Date.now();
      lastRecv.current = Date.now();
      setB(msg);
    });
    // tila lähetetään uudelleen 2 s välein, joten hiljaisuus = host poissa
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [named, cid, name, avatar, code]);

  const clock = useMemo(() => () => Date.now() + offset.current, []);
  const silent = Date.now() - lastRecv.current > HOST_TIMEOUT_MS;

  if (!b) {
    if (silent) {
      return (
        <Waiting>
          <p>Peliä ei löytynyt koodilla {code}. Tarkista koodi ja että host on avannut pelin.</p>
          <Button variant="ghost" onClick={() => onLeave()}>
            Takaisin
          </Button>
        </Waiting>
      );
    }
    return <Waiting>Yhdistetään peliin {code}…</Waiting>;
  }
  if (b.kicked.includes(cid))
    return (
      <Waiting>
        <p>{t.play.kickedOut}</p>
        <Button variant="ghost" onClick={() => onLeave(t.join.kicked)}>
          {t.play.leave}
        </Button>
      </Waiting>
    );
  const me = b.roster[cid];
  if (!me) return <Waiting>Liitytään peliin {code}…</Waiting>;

  const step = b.state.stepKey;
  const send = (v: unknown) => {
    const next = { s: step, v };
    setInp(next);
    void named.presence({ inp: next }).catch(() => {});
  };
  const reason = b.feedback[cid];
  return (
    <PlayerScreen
      uid={cid}
      code={code}
      me={me}
      players={b.roster}
      state={b.state}
      sent={inp && inp.s === step ? inp.v : undefined}
      error={reason ? (t.reject[reason as keyof typeof t.reject] ?? null) : null}
      send={send}
      clock={clock}
      hostAway={silent}
    />
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center text-lg text-paper/80">{children}</div>;
}
