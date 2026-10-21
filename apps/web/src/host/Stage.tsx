import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { expectedResponders, validateInput, type Player } from '@halina/engine';
import { t } from '../i18n/fi.ts';
import { Icon, Sym } from '../components/icons.tsx';
import { Avatar, Delta, OptionTile, PlayerChip, Pop, TimerBar } from '../components/ui.tsx';
import type { HostLike as HostController } from './controller.ts';

type V = Record<string, any>;

interface StageCtx {
  view: V;
  players: Record<string, Player>;
  elapsed: number;
  ctrl: HostController;
}

function useNow(ms = 100) {
  const [, f] = useState(0);
  useEffect(() => {
    const id = setInterval(() => f((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function Stage({ ctrl }: { ctrl: HostController }) {
  useNow();
  const g = ctrl.game!;
  const s = ctrl.state;
  const view = (g.phase?.view ?? { kind: 'lobby' }) as V;
  const now = ctrl.now();
  const remaining = s ? (s.paused ? s.remainingMs : Math.max(0, s.deadline - now)) : 0;
  const elapsed = s ? (s.paused ? s.durationMs - s.remainingMs : now - s.startedAt) : 0;
  const ctx: StageCtx = { view, players: g.players, elapsed, ctrl };
  const mode = g.plan[g.roundIndex]?.mode;

  return (
    <main className="relative flex flex-1 flex-col gap-4 px-8 pt-6 pb-24">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-white/60 md:text-xl">
        <span className="font-black text-white">{t.appName}</span>
        {mode && g.stage !== 'podium' && (
          <span>
            {t.common.round(g.roundIndex, g.plan.length)} · <span className="font-bold text-white">{t.modes[mode].name}</span>
          </span>
        )}
        {typeof view.index === 'number' && <span>{t.common.question(view.index, view.total)}</span>}
        {typeof view.duelIndex === 'number' && <span>{t.common.duel(view.duelIndex, view.total)}</span>}
        <span className="ml-auto rounded-xl bg-white/10 px-4 py-1 font-black tracking-widest text-accent">{ctrl.code}</span>
      </header>
      {s && s.durationMs > 0 && <TimerBar remainingMs={remaining} durationMs={s.durationMs} paused={s.paused} big />}
      {s?.paused && (
        <div className="absolute inset-x-0 top-28 z-20 mx-auto w-fit rounded-2xl bg-accent px-8 py-3 text-xl md:text-3xl font-black text-ink shadow-xl">
          <Icon.pause /> {t.common.paused}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.section
          key={s?.stepKey}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.3 }}
          className="flex flex-1 flex-col"
        >
          <View {...ctx} />
        </motion.section>
      </AnimatePresence>
      {g.phase?.input && <Answered ctrl={ctrl} />}
    </main>
  );
}

function Answered({ ctrl }: { ctrl: HostController }) {
  const g = ctrl.game!;
  const expected = expectedResponders(g);
  const done = new Set(Object.entries(ctrl.inputs).filter(([uid, i]) => validateInput(g, uid, i.value).ok).map(([u]) => u));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2 text-lg font-bold text-white/60">{t.common.answered(done.size, expected.length)}</span>
      {expected.map((uid) => (
        <motion.span
          key={uid}
          animate={{ scale: done.has(uid) ? 1.15 : 1, opacity: done.has(uid) ? 1 : 0.35 }}
          className="inline-flex"
          title={g.players[uid]?.name}
        >
          <Avatar id={g.players[uid]?.avatar ?? ''} name={g.players[uid]?.name} ghost={g.players[uid]?.alive === false} />
        </motion.span>
      ))}
    </div>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="my-4 text-center">
      <h1 className="text-3xl md:text-5xl leading-tight font-black text-balance xl:text-6xl">{children}</h1>
      {sub && <div className="mt-3 text-2xl text-white/70">{sub}</div>}
    </div>
  );
}

function Options({ view, reveal }: { view: V; reveal?: boolean }) {
  const counts = view.counts as number[] | undefined;
  return (
    <div className="mt-auto grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
      {(view.options as string[]).map((o, i) => (
        <OptionTile
          key={i}
          index={i}
          text={o}
          big
          count={reveal ? counts?.[i] : undefined}
          state={reveal ? (i === view.correct ? 'correct' : 'wrong') : 'idle'}
        />
      ))}
    </div>
  );
}

function ResultChips({
  players,
  rows,
}: {
  players: Record<string, Player>;
  rows: { uid: string; delta: number; note?: ReactNode }[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {rows
        .sort((a, b) => b.delta - a.delta)
        .map((r, i) => (
          <Pop key={r.uid} delay={0.3 + i * 0.05}>
            <PlayerChip p={players[r.uid]} extra={<>{r.note}<Delta n={r.delta} /></>} />
          </Pop>
        ))}
    </div>
  );
}

function View(ctx: StageCtx) {
  const { view, players } = ctx;
  switch (view.kind) {
    case 'intro': {
      const m = t.modes[view.mode as keyof typeof t.modes];
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {view.final && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="eyebrow text-base text-accent2 md:text-xl">
              {t.common.final}
            </motion.div>
          )}
          <div className="text-xl md:text-3xl text-white/60">{t.common.round(view.round, view.totalRounds)}</div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
            className="text-6xl md:text-[8rem] leading-none font-black text-accent"
          >
            {m.name}
          </motion.h1>
          <Pop delay={0.6}>
            <p className="max-w-4xl text-2xl md:text-4xl font-bold text-balance">{m.rule}</p>
          </Pop>
          {view.final && <Pop delay={1}><p className="text-xl md:text-3xl text-white/70">{t.stage.introFinal}</p></Pop>}
          {view.options?.estimateVariant === 'under' && <p className="text-xl md:text-3xl text-accent2">{t.estimateUnder}</p>}
        </div>
      );
    }

    case 'mc-question':
    case 'wager-question':
    case 'survivor-question':
      return (
        <div className="flex flex-1 flex-col">
          <div className="text-center text-2xl font-bold text-accent">{view.category}</div>
          <Title>{view.prompt}</Title>
          {view.kind === 'survivor-question' && view.ghosts?.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-lg text-white/60">
              {t.stage.ghosts}:
              {(view.ghosts as string[]).map((u) => (
                <PlayerChip key={u} p={players[u]} />
              ))}
            </div>
          )}
          <Options view={view} />
        </div>
      );

    case 'mc-reveal':
    case 'survivor-reveal': {
      const results = view.results as Record<string, { points: number; correct: boolean; streak?: number }>;
      return (
        <div className="flex flex-1 flex-col gap-4">
          <Title>{view.prompt}</Title>
          {view.kind === 'survivor-reveal' && (
            <div className="flex flex-wrap items-center justify-center gap-3 text-2xl">
              {view.cellar.length === 0 ? (
                <span className="font-black text-good">{t.stage.allSafe}</span>
              ) : (
                <>
                  <span className="eyebrow text-accent2">{t.stage.toCellar}</span>
                  {(view.cellar as string[]).map((u) => (
                    <PlayerChip key={u} p={players[u]} />
                  ))}
                </>
              )}
              {(view.revived as string[]).map((u) => (
                <PlayerChip key={u} p={players[u]} extra={<span className="text-good">{t.stage.revived}</span>} />
              ))}
            </div>
          )}
          <ResultChips
            players={players}
            rows={Object.entries(results)
              .filter(([, r]) => r.points > 0)
              .map(([uid, r]) => ({ uid, delta: r.points, note: r.streak && r.streak > 1 ? <span className="inline-flex items-center gap-0.5 tabular-nums text-accent"><Sym.Flame size={14} aria-hidden />{r.streak}</span> : null }))}
          />
          <Options view={view} reveal />
        </div>
      );
    }

    case 'wager-category':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="text-xl md:text-3xl text-white/60">{t.stage.category}</div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-6xl md:text-9xl font-black text-accent">
            {view.category}
          </motion.div>
        </div>
      );

    case 'wager-bet':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <div className="text-3xl md:text-5xl font-black text-accent">{view.category}</div>
          <motion.h1 className="text-5xl md:text-8xl font-black">
            <Sym.Coins className="mr-4 inline h-12 w-12 text-accent md:h-20 md:w-20" aria-hidden />{t.stage.wagerNow}
          </motion.h1>
          <p className="text-xl md:text-3xl text-white/70">{t.stage.wagerHint}</p>
        </div>
      );

    case 'wager-reveal': {
      const results = view.results as Record<string, { amount: number; floor: boolean; correct: boolean; delta: number }>;
      return (
        <div className="flex flex-1 flex-col gap-4">
          <Title>{view.prompt}</Title>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-6">
            {view.biggestWin && (
              <Pop delay={0.8} className="rounded-3xl bg-good/20 p-5 text-center">
                <div className="text-xl text-good">{t.stage.biggestWin}</div>
                <div className="text-xl md:text-3xl font-black">
                  <Avatar id={players[view.biggestWin]?.avatar ?? ''} name={players[view.biggestWin]?.name} /> {players[view.biggestWin]?.name}{' '}
                  <Delta n={results[view.biggestWin].delta} />
                </div>
              </Pop>
            )}
            {view.biggestLoss && (
              <Pop delay={1.1} className="rounded-3xl bg-bad/20 p-5 text-center">
                <div className="text-xl text-bad">{t.stage.biggestLoss}</div>
                <div className="text-xl md:text-3xl font-black">
                  <Avatar id={players[view.biggestLoss]?.avatar ?? ''} name={players[view.biggestLoss]?.name} /> {players[view.biggestLoss]?.name}{' '}
                  <Delta n={results[view.biggestLoss].delta} />
                </div>
              </Pop>
            )}
          </div>
          <ResultChips
            players={players}
            rows={Object.entries(results).map(([uid, r]) => ({
              uid,
              delta: r.delta,
              note: <span className="text-white/60">{r.floor ? 'pohja ' : 'panos '}{r.amount.toLocaleString('fi-FI')}</span>,
            }))}
          />
          <Options view={{ ...view, counts: undefined }} reveal />
        </div>
      );
    }

    case 'bluff-write':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <Title sub={t.stage.writeLie}>{view.prompt}</Title>
        </div>
      );

    case 'bluff-choose':
      return (
        <div className="flex flex-1 flex-col gap-6">
          <Title sub={t.stage.findTruth}>{view.prompt}</Title>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
            {(view.options as { id: string; text: string }[]).map((o, i) => (
              <Pop key={o.id} delay={i * 0.08} className="rounded-2xl bg-white/10 px-6 py-5 text-xl md:text-3xl font-bold">
                {o.text}
              </Pop>
            ))}
          </div>
        </div>
      );

    case 'bluff-reveal':
      return <BluffReveal {...ctx} />;

    case 'cellar':
      return <Cellar {...ctx} />;

    case 'cellar-verdict': {
      const v = view.verdict;
      if (!v) return null;
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="text-2xl md:text-4xl font-black text-white/70">{t.challenges[v.challenge as keyof typeof t.challenges].name}</div>
          {v.challenge === 'doors' && <div className="text-2xl md:text-4xl">{t.stage.trapWas(v.trap)}</div>}
          {v.challenge === 'math' && (
            <div className="flex flex-wrap justify-center gap-6 text-xl md:text-3xl font-black tabular-nums">
              {(v.problems as { text: string; answer: number }[]).map((p, i) => (
                <span key={i}>
                  {p.text} = <span className="text-accent">{p.answer}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-4">
            {(v.dead as string[]).map((u, i) => (
              <motion.div key={u} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.3 }}>
                <div className="rounded-3xl bg-bad/20 px-6 py-4 text-xl md:text-3xl font-black">
                  <Avatar id={players[u]?.avatar ?? ''} name={players[u]?.name} ghost /> {players[u]?.name} <div className="text-lg font-normal text-bad">{t.stage.died}</div>
                </div>
              </motion.div>
            ))}
            {(v.survivors as string[]).map((u) => (
              <div key={u} className="rounded-3xl bg-good/20 px-6 py-4 text-xl md:text-3xl font-black">
                <Avatar id={players[u]?.avatar ?? ''} name={players[u]?.name} /> {players[u]?.name}
                <div className="text-lg font-normal text-good">{v.spared === u ? t.stage.spared : t.stage.survived}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'estimate-question':
      return (
        <div className="flex flex-1 flex-col items-center justify-center">
          <Title sub={view.unit ? `(${view.unit})` : undefined}>{view.prompt}</Title>
          {view.variant === 'under' && <p className="text-xl md:text-3xl text-accent2">{t.estimateUnder}</p>}
        </div>
      );

    case 'estimate-reveal':
      return <EstimateReveal {...ctx} />;

    case 'duel-intro':
    case 'duel-bet':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-10">
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-16">
            <Duelist p={players[view.a]} side="left" />
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-3xl md:text-6xl font-black text-paper/40">
              <Sym.Swords className="h-12 w-12 md:h-20 md:w-20" aria-hidden />
            </motion.div>
            <Duelist p={players[view.b]} side="right" />
          </div>
          {view.kind === 'duel-bet' && <p className="text-2xl md:text-4xl font-bold">{t.play.betOn}</p>}
        </div>
      );

    case 'duel-question':
    case 'duel-q-reveal':
      return (
        <div className="flex flex-1 flex-col">
          <DuelScore view={view} players={players} />
          <Title>{view.prompt}</Title>
          {view.kind === 'duel-q-reveal' && (
            <div className="mb-4 text-center text-xl md:text-3xl font-black">
              {view.winner ? (
                <span className="text-good">
                  {t.stage.roundWinner}: {players[view.winner]?.name}
                </span>
              ) : (
                <span className="text-white/60">{t.stage.noRoundWinner}</span>
              )}
            </div>
          )}
          <Options view={view} reveal={view.kind === 'duel-q-reveal'} />
        </div>
      );

    case 'duel-tiebreak':
      return (
        <div className="flex flex-1 flex-col items-center justify-center">
          <DuelScore view={view} players={players} />
          <div className="text-2xl md:text-4xl font-black text-accent2">{t.stage.tiebreak}</div>
          <Title sub={view.unit ? `(${view.unit})` : undefined}>{view.prompt}</Title>
        </div>
      );

    case 'duel-result': {
      const r = view.result;
      if (!r) return null;
      const bettors = Object.entries(r.bettors ?? {}) as [string, { pick: string; correct: boolean }][];
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          {view.tiebreak && (
            <div className="text-2xl text-white/70">
              {t.stage.correctAnswer}: <b className="text-white">{Number(view.tiebreak.answer).toLocaleString('fi-FI')} {view.tiebreak.unit}</b>
              {' · '}
              {Object.entries(view.tiebreak.guesses as Record<string, number>).map(([u, g]) => (
                <span key={u} className="ml-3">
                  {players[u]?.name}: {g.toLocaleString('fi-FI')}
                </span>
              ))}
            </div>
          )}
          <div className="text-xl md:text-3xl text-white/60">{t.stage.winner}</div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Avatar id={players[r.winner]?.avatar ?? ''} name={players[r.winner]?.name} size="xl" />
            <div className="text-5xl md:text-7xl font-black text-accent">{players[r.winner]?.name}</div>
          </motion.div>
          <div className="text-xl md:text-3xl">
            <Delta n={1000 + r.steal} /> <span className="text-white/60">{t.stage.steals(r.steal)}</span>
          </div>
          {bettors.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {bettors.map(([u, b]) => (
                <PlayerChip key={u} p={players[u]} extra={b.correct ? <Delta n={300} /> : <span className="text-white/40">–</span>} />
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'scoreboard':
      return <Scoreboard {...ctx} />;

    case 'podium':
      return <Podium {...ctx} />;

    default:
      return null;
  }
}

function Duelist({ p, side }: { p: Player | undefined; side: 'left' | 'right' }) {
  return (
    <motion.div
      initial={{ x: side === 'left' ? -300 : 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 90 }}
      className="flex flex-col items-center gap-3"
    >
      <Avatar id={p?.avatar ?? ''} name={p?.name} size="xl" />
      <div className="text-4xl md:text-6xl font-black">{p?.name}</div>
      <div className="text-2xl text-white/60">{t.common.points(p?.score ?? 0)}</div>
    </motion.div>
  );
}

function DuelScore({ view, players }: { view: V; players: Record<string, Player> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 text-xl md:text-3xl font-black">
      <span>
        <Avatar id={players[view.a]?.avatar ?? ''} name={players[view.a]?.name} /> {players[view.a]?.name}
      </span>
      <span className="rounded-xl bg-white/10 px-5 py-1 tabular-nums">
        {view.wins[view.a]} – {view.wins[view.b]}
      </span>
      <span>
        {players[view.b]?.name} <Avatar id={players[view.b]?.avatar ?? ''} name={players[view.b]?.name} />
      </span>
    </div>
  );
}

function BluffReveal({ view, players, elapsed }: StageCtx) {
  const seq = view.sequence as { id: string; text: string; authors: string[]; house: boolean; truth: boolean; choosers: string[] }[];
  const shown = Math.min(seq.length, Math.floor(elapsed / view.stepMs) + 1);
  const cur = seq[shown - 1];
  const done = elapsed > view.stepMs * seq.length;
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Title>{view.prompt}</Title>
      <AnimatePresence mode="wait">
        {cur && !done && (
          <motion.div
            key={cur.id}
            initial={{ rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ opacity: 0, x: -100 }}
            className={`mx-auto flex w-full max-w-4xl flex-col items-center gap-5 rounded-3xl p-8 text-center ${cur.truth ? 'bg-good/25' : 'bg-white/10'}`}
          >
            <div className="text-3xl md:text-5xl font-black">{cur.text}</div>
            {cur.choosers.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2 text-xl">
                <span className="text-white/60">{cur.truth ? t.stage.foundTruth : t.stage.fellFor}:</span>
                {cur.choosers.map((u) => (
                  <PlayerChip key={u} p={players[u]} />
                ))}
              </div>
            ) : (
              <div className="text-xl text-white/50">{t.stage.nobodyFell}</div>
            )}
            <Pop delay={1.5}>
              {cur.truth ? (
                <div className="text-4xl md:text-6xl font-black tracking-widest text-good">{t.stage.truth}</div>
              ) : cur.house ? (
                <div className="text-xl md:text-3xl font-bold text-white/70">{t.stage.houseLie}</div>
              ) : (
                <div className="flex items-center gap-3 text-xl md:text-3xl font-bold">
                  {t.stage.lieBy}
                  {cur.authors.map((u) => (
                    <PlayerChip key={u} p={players[u]} extra={<Delta n={500 * cur.choosers.length} />} />
                  ))}
                </div>
              )}
            </Pop>
          </motion.div>
        )}
        {done && (
          <motion.div key="sum" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ResultChips players={players} rows={Object.entries(view.deltas as Record<string, number>).map(([uid, d]) => ({ uid, delta: d }))} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Cellar({ view, players }: StageCtx) {
  const ch = t.challenges[view.challenge as keyof typeof t.challenges];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_center,rgba(232,96,60,0.12),transparent_60%)] text-center">
      
      <h1 className="eyebrow text-xl text-accent2 md:text-2xl">{t.stage.cellarTitle}</h1>
      <div className="text-3xl md:text-5xl font-black">{ch.name}</div>
      <p className="max-w-3xl text-xl md:text-3xl text-white/80">{ch.rule}</p>
      {view.challenge === 'doors' && (
        <div className="flex gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="grid h-40 w-24 place-items-end justify-center rounded-t-[3rem] border-2 border-paper/30 bg-ink2 pb-4 md:h-56 md:w-32">
              <Sym.DoorClosed className="mb-2 h-10 w-10 text-paper/50" aria-hidden /><span className="tabular-nums text-3xl">{n}</span>
            </div>
          ))}
        </div>
      )}
      {view.challenge === 'math' && (
        <div className="flex flex-wrap justify-center gap-4 md:gap-10 text-3xl md:text-5xl font-black tabular-nums">
          {(view.problems as string[]).map((p) => (
            <span key={p}>{p} = ?</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3 text-2xl">
        {(view.cellar as string[]).map((u) => (
          <PlayerChip key={u} p={players[u]} />
        ))}
      </div>
    </div>
  );
}

function EstimateReveal({ view, players, elapsed }: StageCtx) {
  const guesses = view.guesses as { uid: string; guess: number; err: number; rank: number | null; points: number; over: boolean }[];
  const answer = view.answer as number;
  const values = [answer, ...guesses.map((g) => g.guess)];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  const pos = (x: number) => ((x - (min - pad)) / (max - min + 2 * pad)) * 100;
  const dropped = elapsed > 1500;
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Title>{view.prompt}</Title>
      <div className="relative mx-6 mt-16 h-56 overflow-visible">
        <div className="absolute inset-x-0 top-1/2 h-2 rounded-full bg-white/30" />
        {guesses.map((g, i) => (
          <motion.div
            key={g.uid}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${pos(g.guess)}%`, top: i % 2 ? '58%' : '0%' }}
          >
            <Avatar id={players[g.uid]?.avatar ?? ''} name={players[g.uid]?.name} />
            <span className="text-sm font-bold whitespace-nowrap">{players[g.uid]?.name}</span>
            <span className="text-xs text-white/60 tabular-nums">{g.guess.toLocaleString('fi-FI')}</span>
          </motion.div>
        ))}
        <motion.div
          initial={{ y: -300, opacity: 0 }}
          animate={dropped ? { y: 0, opacity: 1 } : {}}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="absolute top-[calc(50%-3.5rem)] flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${pos(answer)}%` }}
        >
          <span className="rounded-xl bg-accent px-4 py-1 text-xl md:text-3xl font-black whitespace-nowrap text-ink">
            {answer.toLocaleString('fi-FI')} {view.unit}
          </span>
          <span className="h-10 w-1 bg-accent" />
        </motion.div>
      </div>
      {dropped && (
        <ResultChips
          players={players}
          rows={guesses.map((g) => ({
            uid: g.uid,
            delta: g.points,
            note: g.rank ? <span className="text-white/60">#{g.rank}</span> : g.over ? <span className="text-bad">{t.stage.over}</span> : null,
          }))}
        />
      )}
    </div>
  );
}

function Scoreboard({ view, players }: StageCtx) {
  const ranking = view.ranking as { uid: string; score: number; delta: number; rank: number }[];
  const top = ranking.slice(0, 10);
  return (
    <div className="flex flex-1 flex-col items-center gap-4">
      <h1 className="text-4xl md:text-6xl font-black">{t.stage.scoreboard}</h1>
      <ol className="flex w-full max-w-4xl flex-col gap-2">
        {top.map((r, i) => (
          <motion.li
            key={r.uid}
            layout
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * (top.length - i) }}
            className={`flex items-center gap-4 rounded-2xl px-5 py-3 text-xl md:text-3xl ${i === 0 ? 'bg-accent text-ink' : 'bg-white/10'}`}
          >
            <span className="w-10 font-black tabular-nums">{r.rank}.</span>
            <Avatar id={players[r.uid]?.avatar ?? ''} name={players[r.uid]?.name} />
            <span className="flex-1 truncate font-bold">{players[r.uid]?.name}</span>
            {r.delta !== 0 && <Delta n={r.delta} className={`text-2xl ${i === 0 ? '!text-ink' : ''}`} />}
            <span className="w-24 md:w-40 text-right font-black tabular-nums">{r.score.toLocaleString('fi-FI')}</span>
          </motion.li>
        ))}
      </ol>
      {view.nextMode && (
        <div className="mt-auto text-xl md:text-3xl text-white/70">
          {t.stage.nextUp}: <b className="text-accent">{t.modes[view.nextMode as keyof typeof t.modes].name}</b>
        </div>
      )}
    </div>
  );
}

function Podium({ view, players }: StageCtx) {
  const ranking = view.ranking as { uid: string; score: number; rank: number }[];
  const awards = view.awards as { id: keyof typeof t.awards; uid: string; value: number }[];
  const order = [1, 0, 2].map((i) => ranking[i]).filter(Boolean);
  const heights = ['h-40 md:h-64', 'h-32 md:h-48', 'h-24 md:h-36'];
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <h1 className="text-4xl md:text-6xl font-black"><Sym.Trophy className="mr-3 inline h-10 w-10 text-accent md:h-14 md:w-14" aria-hidden />{t.stage.podium}</h1>
      <div className="flex items-end gap-2 md:gap-6">
        {order.map((r) => {
          const place = ranking.indexOf(r);
          return (
            <motion.div
              key={r.uid}
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 * (2 - place) + 0.3, type: 'spring' }}
              className="flex w-24 flex-col items-center gap-2 sm:w-40 md:w-64"
            >
              <Avatar id={players[r.uid]?.avatar ?? ''} name={players[r.uid]?.name} size={place === 0 ? 'xl' : 'lg'} />
              <div className="text-2xl md:text-4xl font-black">{players[r.uid]?.name}</div>
              <div className="text-2xl tabular-nums text-white/70">{r.score.toLocaleString('fi-FI')}</div>
              <div className={`${heights[place]} flex w-full items-start justify-center rounded-t-3xl pt-4 text-4xl md:text-6xl font-black ${place === 0 ? 'bg-accent text-ink' : 'bg-white/15'}`}>
                {place + 1}
              </div>
            </motion.div>
          );
        })}
      </div>
      {awards.length > 0 && (
        <Pop delay={2.4} className="w-full max-w-5xl">
          <h2 className="mb-3 text-center text-xl md:text-3xl font-black text-white/70">{t.stage.awards}</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {awards.map((a) => (
              <div key={a.id} className="w-56 rounded-xl border border-line bg-ink2/70 p-4 text-center">
                <div className="text-lg font-bold text-accent">{t.awards[a.id].title}</div>
                <div className="text-2xl font-black">
                  <Avatar id={players[a.uid]?.avatar ?? ''} name={players[a.uid]?.name} size="sm" /> {players[a.uid]?.name}
                </div>
                <div className="text-sm text-white/60">
                  {a.id === 'bravest' ? Math.round(a.value * 100) : a.value} {t.awards[a.id].unit}
                </div>
              </div>
            ))}
          </div>
        </Pop>
      )}
    </div>
  );
}
