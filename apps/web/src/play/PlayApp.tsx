import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ref, serverTimestamp, set, type Database } from 'firebase/database';
import { AnimatePresence, motion } from 'motion/react';
import { normalizeText, type Audience } from '@halina/engine';
import { firebase, signIn, storage } from '../lib/firebase.ts';
import { useServerNow, useValue } from '../lib/hooks.ts';
import {
  AVATAR_IDS,
  joinRoom,
  normalizeCode,
  parsePhase,
  paths,
  trackPresence,
  type Meta,
  type PlayerRow,
  type StateRow,
} from '../lib/room.ts';
import { t } from '../i18n/fi.ts';
import { Avatar, Button, Delta, OptionTile, PlayerChip, Pop, TimerBar } from '../components/ui.tsx';

type V = Record<string, any>;

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
                className={`grid aspect-square min-h-11 place-items-center rounded-xl ${avatar === id ? 'bg-accent' : 'bg-white/10'}`}
              >
                <Avatar id={id} size="sm" />
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

// ---------- peli ----------

function inAudience(a: Audience, uid: string, alive: boolean) {
  return a === 'all' ? true : a === 'alive' ? alive : a.includes(uid);
}

function PlayerGame({ db, uid, code, onLeave }: { db: Database; uid: string; code: string; onLeave: () => void }) {
  const meta = useValue<Meta>(db, paths.meta(code));
  const state = useValue<StateRow>(db, paths.state(code));
  const players = useValue<Record<string, PlayerRow>>(db, paths.players(code)) ?? {};
  const kicked = useValue<boolean>(db, paths.kicked(code, uid));
  const step = state?.stepKey ?? 'lobby';
  const myInput = useValue<{ value: unknown }>(db, state?.input ? paths.input(code, step, uid) : null);
  const feedback = useValue<{ stepKey: string; reason: keyof typeof t.reject }>(db, paths.feedback(code, uid));
  const now = useServerNow(db, 200);

  useEffect(() => trackPresence(db, paths.player(code, uid)), [db, code, uid]);

  const me = players[uid];
  const { view, audience } = parsePhase(state ?? null);

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

  const remaining = state.paused ? state.remainingMs : Math.max(0, state.deadline - now);
  const canAnswer = !!state.input && inAudience(audience, uid, me.alive) && !state.paused && remaining > 0;
  const sent = myInput?.value;
  const send = (value: unknown) => {
    void set(ref(db, paths.input(code, step, uid)), { value, at: serverTimestamp() }).catch(() => {});
  };
  const error = feedback && feedback.stepKey === step ? t.reject[feedback.reason] : null;

  const ctx: Ctx = { uid, me, players, view, canAnswer, sent, send, error, step, input: state.input, audience };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-ink/80 px-4 py-3 backdrop-blur">
        <Avatar id={me.avatar} size="md" ghost={!me.alive} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{me.name}</div>
          <div className="text-sm text-white/60">{code}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/60">{t.play.yourScore}</div>
          <div className="text-2xl font-black tabular-nums">{me.score.toLocaleString('fi-FI')}</div>
        </div>
      </header>
      {meta?.hostConnected === false && (
        <div className="bg-accent2/90 px-4 py-2 text-center font-semibold">{t.common.hostAway}</div>
      )}
      {state.durationMs > 0 && (
        <div className="px-4 pt-3">
          <TimerBar remainingMs={remaining} durationMs={state.durationMs} paused={state.paused} />
        </div>
      )}
      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col gap-4"
          >
            <PhaseBody {...ctx} />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

interface Ctx {
  uid: string;
  me: PlayerRow;
  players: Record<string, PlayerRow>;
  view: V;
  canAnswer: boolean;
  sent: unknown;
  send: (v: unknown) => void;
  error: string | null;
  step: string;
  input: StateRow['input'];
  audience: Audience;
}

function Big({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-2xl font-bold">{children}</div>;
}

function Sent({ ctx }: { ctx: Ctx }) {
  if (ctx.sent === undefined || ctx.sent === null) return null;
  return (
    <p className="text-center font-semibold text-good">
      ✓ {t.play.sent}
      {ctx.canAnswer && <span className="block text-sm font-normal text-white/60">{t.play.change}</span>}
    </p>
  );
}

function PhaseBody(ctx: Ctx) {
  const { view, uid, me } = ctx;
  const notMine = ctx.input && !inAudience(ctx.audience, uid, me.alive);

  switch (view.kind) {
    case 'lobby':
      return (
        <Big>
          <Pop>
            <Avatar id={me.avatar} size="xl" />
          </Pop>
          <div className="text-3xl font-black">{t.play.joined}</div>
          <div className="text-lg font-normal text-white/70">{t.play.waitStart}</div>
        </Big>
      );
    case 'intro': {
      const m = t.modes[view.mode as keyof typeof t.modes];
      return (
        <Big>
          {view.final && <div className="text-accent2 font-black tracking-widest">{t.common.final}</div>}
          <div className="text-sm text-white/60">{t.common.round(view.round, view.totalRounds)}</div>
          <div className="text-4xl font-black">{m.name}</div>
          <div className="text-lg font-normal text-white/80">{m.rule}</div>
          {view.options?.estimateVariant === 'under' && <div className="text-base text-accent">{t.estimateUnder}</div>}
        </Big>
      );
    }
    case 'mc-question':
    case 'wager-question':
    case 'survivor-question':
    case 'duel-question':
      if (notMine) return <Big>{t.play.watchDuel}</Big>;
      return <McInput ctx={ctx} />;
    case 'wager-category':
      return (
        <Big>
          <div className="text-sm text-white/60">{t.stage.category}</div>
          <div className="text-4xl font-black text-accent">{view.category}</div>
        </Big>
      );
    case 'wager-bet':
      return <WagerInput ctx={ctx} />;
    case 'bluff-write':
      return <LieInput ctx={ctx} />;
    case 'bluff-choose':
      return <TruthChoice ctx={ctx} />;
    case 'estimate-question':
    case 'duel-tiebreak':
      if (notMine) return <Big>{t.play.watchDuel}</Big>;
      return <NumberInput ctx={ctx} prompt={view.prompt} unit={view.unit} />;
    case 'cellar':
      if (notMine)
        return (
          <Big>
            <div className="text-4xl">🕯️</div>
            <div>{t.stage.cellarTitle}</div>
            <div className="flex flex-wrap justify-center gap-2 text-base">
              {(view.cellar as string[]).map((u) => (
                <PlayerChip key={u} p={ctx.players[u]} />
              ))}
            </div>
          </Big>
        );
      return <CellarInput ctx={ctx} />;
    case 'duel-intro':
      return (
        <Big>
          {view.a === uid || view.b === uid ? <div className="text-accent2">{t.play.duelYou}</div> : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PlayerChip p={ctx.players[view.a]} />
            <span className="text-white/60">{t.common.vs}</span>
            <PlayerChip p={ctx.players[view.b]} />
          </div>
        </Big>
      );
    case 'duel-bet':
      if (notMine) return <Big>{t.play.duelYou}</Big>;
      return (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <h2 className="text-center text-2xl font-black">{t.play.betOn}</h2>
          {[view.a, view.b].map((u: string, i: number) => (
            <button
              key={u}
              type="button"
              disabled={!ctx.canAnswer}
              onClick={() => ctx.send(u)}
              className={`${i === 0 ? 'bg-opt0' : 'bg-opt1'} flex min-h-24 items-center justify-center gap-3 rounded-2xl text-2xl font-black ${ctx.sent === u ? 'ring-4 ring-white' : ''}`}
            >
              <Avatar id={ctx.players[u]?.avatar ?? ''} /> {ctx.players[u]?.name}
            </button>
          ))}
          <Sent ctx={ctx} />
        </div>
      );
    default:
      return <ResultView ctx={ctx} />;
  }
}

// ---------- syötteet ----------

function McInput({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  return (
    <div className="flex flex-1 flex-col gap-3">
      {!ctx.me.alive && <p className="rounded-xl bg-white/10 p-3 text-sm">{t.play.youAreGhost}</p>}
      <p className="text-center text-lg font-bold">{view.prompt}</p>
      <div className="grid flex-1 grid-cols-1 gap-3">
        {(view.options as string[]).map((o, i) => (
          <OptionTile
            key={i}
            index={i}
            text={o}
            onClick={ctx.canAnswer ? () => ctx.send(i) : undefined}
            disabled={!ctx.canAnswer}
            selected={ctx.sent === i}
            state={ctx.sent !== undefined && ctx.sent !== null && ctx.sent !== i ? 'wrong' : 'idle'}
          />
        ))}
      </div>
      <Sent ctx={ctx} />
    </div>
  );
}

function WagerInput({ ctx }: { ctx: Ctx }) {
  const score = ctx.me.score;
  const floor = ctx.view.floor as number;
  const [amount, setAmount] = useState(Math.round(score / 2));
  const sentAmount = typeof ctx.sent === 'number' ? ctx.sent : null;
  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      <div className="text-center">
        <div className="text-sm text-white/60">{t.stage.category}</div>
        <div className="text-3xl font-black text-accent">{ctx.view.category}</div>
      </div>
      <h2 className="text-center text-xl font-bold">{t.play.wagerTitle}</h2>
      <div className="text-center text-5xl font-black tabular-nums">{amount.toLocaleString('fi-FI')}</div>
      <input
        type="range"
        min={0}
        max={Math.max(score, 0)}
        step={Math.max(1, Math.round(score / 100))}
        value={Math.min(amount, score)}
        onChange={(e) => setAmount(Number(e.target.value))}
        disabled={!ctx.canAnswer || score === 0}
        className="h-12 w-full accent-[var(--color-accent)]"
        aria-label={t.play.wagerTitle}
      />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="danger" disabled={!ctx.canAnswer || score === 0} onClick={() => { setAmount(score); ctx.send(score); }}>
          {t.play.allIn}
        </Button>
        <Button disabled={!ctx.canAnswer} onClick={() => ctx.send(Math.min(amount, score))}>
          {t.play.lockWager}
        </Button>
      </div>
      {score < floor && (
        <Button variant="ghost" disabled={!ctx.canAnswer} onClick={() => { setAmount(floor); ctx.send(floor); }}>
          {t.play.floorBet(floor)}
        </Button>
      )}
      {sentAmount !== null && (
        <p className="text-center font-semibold text-good">
          ✓ {t.play.sent}: {sentAmount.toLocaleString('fi-FI')}
        </p>
      )}
      {ctx.error && <p className="text-center font-semibold text-bad">{ctx.error}</p>}
      <p className="text-center text-sm text-white/60">{t.stage.wagerHint}</p>
    </div>
  );
}

const lieKey = (view: V) => `halina.lie.${view.prompt}`;

function LieInput({ ctx }: { ctx: Ctx }) {
  const [text, setText] = useState(typeof ctx.sent === 'string' ? ctx.sent : '');
  const max = ctx.view.maxLength as number;
  const submit = () => {
    if (!text.trim()) return;
    try {
      sessionStorage.setItem(lieKey(ctx.view), text.trim());
    } catch {
      /* ei tallennusta */
    }
    ctx.send(text.trim());
  };
  const accepted = typeof ctx.sent === 'string' && !ctx.error;
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-center text-xl font-bold">{ctx.view.prompt}</p>
      <h2 className="text-center text-sm font-semibold text-white/60">{t.play.lieTitle}</h2>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, max))}
        maxLength={max}
        placeholder={t.play.liePlaceholder}
        disabled={!ctx.canAnswer}
        autoComplete="off"
        className="h-16 rounded-xl bg-white px-4 text-xl font-bold text-ink"
      />
      <div className="text-right text-xs text-white/50">
        {text.length}/{max}
      </div>
      {ctx.error && <p className="rounded-xl bg-bad/20 p-3 text-center font-bold text-bad">{ctx.error}</p>}
      <Button type="submit" disabled={!ctx.canAnswer || !text.trim()}>
        {t.play.sendLie}
      </Button>
      {accepted && <Sent ctx={ctx} />}
    </form>
  );
}

function TruthChoice({ ctx }: { ctx: Ctx }) {
  let myLie = '';
  try {
    myLie = normalizeText(sessionStorage.getItem(lieKey(ctx.view)) ?? '');
  } catch {
    /* ei tallennusta */
  }
  // omaa valhetta ei näytetä omassa puhelimessa
  const options = (ctx.view.options as { id: string; text: string }[]).filter((o) => normalizeText(o.text) !== myLie);
  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-center text-lg font-bold">{ctx.view.prompt}</p>
      <h2 className="text-center text-sm font-semibold text-white/60">{t.play.pickTruth}</h2>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={!ctx.canAnswer}
          onClick={() => ctx.send(o.id)}
          className={`min-h-14 rounded-xl px-4 py-3 text-left text-lg font-bold ${ctx.sent === o.id ? 'bg-accent text-ink' : 'bg-white/10'}`}
        >
          {o.text}
        </button>
      ))}
      {ctx.error && <p className="text-center font-semibold text-bad">{ctx.error}</p>}
      <Sent ctx={ctx} />
    </div>
  );
}

function NumberInput({ ctx, prompt, unit }: { ctx: Ctx; prompt: string; unit: string }) {
  const [s, setS] = useState(typeof ctx.sent === 'number' ? String(ctx.sent).replace('.', ',') : '');
  const press = (k: string) => {
    if (k === '⌫') return setS((x) => x.slice(0, -1));
    if (k === ',' && s.includes(',')) return;
    if (s.replace(/\D/g, '').length >= 13) return;
    setS((x) => (x === '0' && k !== ',' ? k : x + k));
  };
  const num = s ? Number(s.replace(',', '.')) : NaN;
  const pretty = s ? (s.includes(',') ? s : Number(s).toLocaleString('fi-FI')) : '';
  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-center text-lg font-bold">{prompt}</p>
      <div className="flex h-16 items-center justify-end gap-2 rounded-xl bg-white px-4 text-ink">
        <span className="text-3xl font-black tabular-nums">{pretty || <span className="text-ink/30">{t.play.estimatePlaceholder}</span>}</span>
        {unit && <span className="font-semibold text-ink/60">{unit}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((k) => (
          <button
            key={k}
            type="button"
            disabled={!ctx.canAnswer}
            onClick={() => press(k)}
            className="min-h-14 rounded-xl bg-white/10 text-2xl font-black active:bg-white/25 disabled:opacity-40"
          >
            {k}
          </button>
        ))}
      </div>
      <Button disabled={!ctx.canAnswer || !Number.isFinite(num)} onClick={() => ctx.send(num)}>
        {t.play.send}
      </Button>
      <Sent ctx={ctx} />
    </div>
  );
}

function CellarInput({ ctx }: { ctx: Ctx }) {
  const { view } = ctx;
  const ch = t.challenges[view.challenge as keyof typeof t.challenges];
  const [math, setMath] = useState<string[]>(['', '', '']);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="text-center">
        <div className="text-3xl">🕯️</div>
        <h2 className="text-2xl font-black text-accent2">{t.play.inCellar}</h2>
        <div className="text-xl font-bold">{ch.name}</div>
        <p className="text-white/70">{ch.rule}</p>
      </div>
      {view.challenge === 'doors' && (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((d) => (
            <button
              key={d}
              type="button"
              disabled={!ctx.canAnswer}
              onClick={() => ctx.send(d)}
              className={`flex aspect-[2/3] flex-col items-center justify-center rounded-t-full border-4 text-xl font-black ${ctx.sent === d ? 'border-accent bg-accent/30' : 'border-white/30 bg-ink2'}`}
            >
              🚪
              <span>{d + 1}</span>
            </button>
          ))}
        </div>
      )}
      {view.challenge === 'math' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            ctx.send(math.map((x) => Number(x)));
          }}
        >
          {(view.problems as string[]).map((p, k) => (
            <label key={k} className="flex items-center gap-3 text-2xl font-black">
              <span className="flex-1 tabular-nums">{p} =</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={math[k]}
                disabled={!ctx.canAnswer}
                onChange={(e) => setMath((m) => m.map((x, j) => (j === k ? e.target.value.replace(/[^0-9-]/g, '') : x)))}
                className="h-14 w-28 rounded-xl bg-white px-3 text-right text-ink"
              />
            </label>
          ))}
          <Button type="submit" disabled={!ctx.canAnswer || math.some((x) => x === '')}>
            {t.play.send}
          </Button>
        </form>
      )}
      {view.challenge === 'sacrifice' && (
        <div className="flex flex-col gap-2">
          <h3 className="text-center font-bold">{t.play.vote}</h3>
          {(view.cellar as string[])
            .filter((u) => u !== ctx.uid)
            .map((u) => (
              <button
                key={u}
                type="button"
                disabled={!ctx.canAnswer}
                onClick={() => ctx.send(u)}
                className={`flex min-h-14 items-center gap-3 rounded-xl px-4 text-lg font-bold ${ctx.sent === u ? 'bg-bad' : 'bg-white/10'}`}
              >
                <Avatar id={ctx.players[u]?.avatar ?? ''} size="sm" /> {ctx.players[u]?.name}
              </button>
            ))}
        </div>
      )}
      {ctx.error && <p className="text-center font-semibold text-bad">{ctx.error}</p>}
      <Sent ctx={ctx} />
    </div>
  );
}

// ---------- tulokset ----------

function Outcome({ ok, title, delta, sub }: { ok: boolean | null; title: string; delta?: number; sub?: ReactNode }) {
  return (
    <Big>
      <Pop>
        <div className={`text-6xl ${ok === null ? '' : ''}`}>{ok === true ? '🎉' : ok === false ? '😬' : '⏳'}</div>
      </Pop>
      <div className={`text-4xl font-black ${ok === true ? 'text-good' : ok === false ? 'text-bad' : ''}`}>{title}</div>
      {delta !== undefined && <Delta n={delta} className="text-3xl" />}
      {sub && <div className="text-lg font-normal text-white/80">{sub}</div>}
    </Big>
  );
}

function ResultView({ ctx }: { ctx: Ctx }) {
  const { view, uid } = ctx;
  switch (view.kind) {
    case 'mc-reveal':
    case 'survivor-reveal': {
      const r = view.results?.[uid];
      if (!r) return <Big>{t.play.lookUp}</Big>;
      const toCellar = view.kind === 'survivor-reveal' && (view.cellar as string[]).includes(uid);
      const revived = view.kind === 'survivor-reveal' && (view.revived as string[]).includes(uid);
      return (
        <Outcome
          ok={r.correct}
          title={r.choice === null ? t.play.noAnswer : r.correct ? t.play.correct : t.play.wrong}
          delta={r.points}
          sub={toCellar ? `🕯️ ${t.stage.toCellar}!` : revived ? t.stage.revived : r.streak > 1 ? `🔥 ${r.streak}` : undefined}
        />
      );
    }
    case 'wager-reveal': {
      const r = view.results?.[uid];
      if (!r) return <Big>{t.play.lookUp}</Big>;
      return <Outcome ok={r.correct} title={r.correct ? t.play.correct : r.choice === null ? t.play.noAnswer : t.play.wrong} delta={r.delta} />;
    }
    case 'bluff-reveal': {
      const seq = view.sequence as { authors: string[]; choosers: string[]; truth: boolean }[];
      const mine = seq.find((o) => o.authors.includes(uid));
      const picked = seq.find((o) => o.choosers.includes(uid));
      const d = (view.deltas?.[uid] as number) ?? 0;
      return (
        <Outcome
          ok={d > 0}
          title={picked?.truth ? t.play.gotTruth : picked ? t.play.gotFooled : t.play.lookUp}
          delta={d}
          sub={mine && mine.choosers.length > 0 ? t.play.fooled(mine.choosers.length) : undefined}
        />
      );
    }
    case 'cellar-verdict': {
      const v = view.verdict;
      if (!v) return <Big>{t.play.lookUp}</Big>;
      if (v.dead.includes(uid)) return <Outcome ok={false} title={t.stage.died} sub="👻" />;
      if (v.survivors.includes(uid)) return <Outcome ok title={t.stage.survived} />;
      return <Big>{t.play.lookUp}</Big>;
    }
    case 'estimate-reveal': {
      const g = (view.guesses as { uid: string; guess: number; rank: number | null; points: number }[]).find((x) => x.uid === uid);
      return (
        <Outcome
          ok={g ? g.points > 0 : null}
          title={`${t.stage.correctAnswer}: ${Number(view.answer).toLocaleString('fi-FI')} ${view.unit}`}
          delta={g?.points ?? 0}
          sub={g ? `${g.guess.toLocaleString('fi-FI')} ${view.unit}${g.rank ? ` · #${g.rank}` : ''}` : t.play.noAnswer}
        />
      );
    }
    case 'duel-q-reveal': {
      const w = view.winner as string | null;
      return (
        <Big>
          <div>{w ? `${t.stage.roundWinner}: ${ctx.players[w]?.name ?? ''}` : t.stage.noRoundWinner}</div>
          <div className="text-5xl font-black tabular-nums">
            {view.wins[view.a]} – {view.wins[view.b]}
          </div>
        </Big>
      );
    }
    case 'duel-result': {
      const r = view.result;
      if (!r) return <Big>{t.play.lookUp}</Big>;
      if (r.winner === uid) return <Outcome ok title={t.stage.winner + '!'} delta={1000 + r.steal} />;
      if (r.loser === uid) return <Outcome ok={false} title={t.play.wrong} delta={-r.steal} />;
      const b = r.bettors?.[uid];
      return b ? <Outcome ok={b.correct} title={b.correct ? t.play.correct : t.play.wrong} delta={b.correct ? 300 : 0} /> : <Big>{t.play.lookUp}</Big>;
    }
    case 'scoreboard':
    case 'podium': {
      const row = (view.ranking as { uid: string; rank: number; delta: number }[]).find((r) => r.uid === uid);
      return (
        <Big>
          {view.kind === 'podium' && <div className="text-6xl">{row && row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : '🎈'}</div>}
          <div className="text-3xl font-black">{row ? t.play.yourRank(row.rank) : ''}</div>
          {view.kind === 'scoreboard' && row && <Delta n={row.delta} className="text-2xl" />}
          <div className="text-5xl font-black tabular-nums">{ctx.me.score.toLocaleString('fi-FI')}</div>
        </Big>
      );
    }
    default:
      return <Big>{t.play.lookUp}</Big>;
  }
}
