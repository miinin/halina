import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { DEFAULT_COUNTS, isSuspicious, MODES, PLAN_TEMPLATES, type ModeId, type PlanItem, type QuestionPack } from '@halina/engine';
import { BUILTIN_PACKS, parsePack } from '@halina/content';
import { LAN_ORIGIN } from '../lib/firebase.ts';
import { t } from '../i18n/fi.ts';
import { Avatar, Button } from '../components/ui.tsx';
import { Icon } from '../components/icons.tsx';
import type { HostLike } from './controller.ts';

const MIN_TO_START = 2;
const MODE_IDS = Object.keys(MODES) as ModeId[];

export function joinUrl(code: string) {
  return `${LAN_ORIGIN || location.origin}/play?code=${code}`;
}

export function Lobby({
  ctrl,
  joinPanel,
  extraSettings,
  showSpeed = import.meta.env.DEV,
}: {
  ctrl: HostLike;
  /** korvaa QR-koodin ja osoitteen (esim. selaindemossa) */
  joinPanel?: ReactNode;
  extraSettings?: ReactNode;
  showSpeed?: boolean;
}) {
  const [plan, setPlan] = useState<PlanItem[]>(PLAN_TEMPLATES[0].plan);
  const [templateId, setTemplateId] = useState<string>(PLAN_TEMPLATES[0].id);
  const [packs, setPacks] = useState<QuestionPack[]>(BUILTIN_PACKS);
  const [packId, setPackId] = useState(BUILTIN_PACKS[0].id);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [speed, setSpeed] = useState(() => Number(new URLSearchParams(location.search).get('speed')) || 1);
  const [qr, setQr] = useState('');
  const url = joinUrl(ctrl.code);
  const players = Object.entries(ctrl.roster).sort((a, b) => (a[1].joinedAt ?? 0) - (b[1].joinedAt ?? 0));
  const n = players.length;

  useEffect(() => {
    if (joinPanel) return;
    void QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#1b1033', light: '#ffffff' } }).then(setQr);
  }, [url, joinPanel]);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = PLAN_TEMPLATES.find((x) => x.id === id);
    if (tpl) setPlan(tpl.plan.map((p) => ({ ...p })));
  };
  const edit = (i: number, patch: Partial<PlanItem>) => {
    setTemplateId('custom');
    setPlan((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const importFile = async (file: File) => {
    try {
      const r = parsePack(JSON.parse(await file.text()));
      if (!r.ok) return setImportMsg({ ok: false, text: `${t.host.importFail} ${r.errors.join('; ')}` });
      const total = r.pack.classic.length + r.pack.estimate.length + r.pack.bluff.length;
      setPacks((ps) => [...ps.filter((p) => p.id !== r.pack.id), r.pack]);
      setPackId(r.pack.id);
      setImportMsg({ ok: true, text: t.host.importOk(r.pack.name, total) });
    } catch (e) {
      setImportMsg({ ok: false, text: `${t.host.importFail} ${String(e)}` });
    }
  };

  const pack = packs.find((p) => p.id === packId) ?? packs[0];

  return (
    <div className="grid min-h-full gap-6 p-6 lg:grid-cols-[1.2fr_1fr] lg:p-10">
      <section className="flex flex-col gap-6">
        {joinPanel ?? (
        <div className="flex flex-wrap items-center gap-8 rounded-xl border border-line bg-ink2/60 p-6">
          <div className="w-52 shrink-0 overflow-hidden rounded-2xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label={url} />
          <div className="min-w-0">
            <div className="text-xl text-white/70">
              {t.host.joinAt} <span className="font-bold text-white">{url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</span> {t.host.withCode}
            </div>
            <div className="text-[7rem] leading-none font-black tracking-[0.15em] text-accent" data-testid="room-code">
              {ctrl.code}
            </div>
          </div>
        </div>
        )}

        <div className="flex-1 rounded-xl border border-line bg-ink2/60 p-6">
          <h2 className="mb-4 text-2xl font-black">{t.host.players(n)}</h2>
          {n === 0 && <p className="text-xl text-white/60">{t.host.noPlayers}</p>}
          <div className="flex flex-wrap gap-3">
            <AnimatePresence>
              {players.map(([uid, p]) => (
                <motion.div
                  key={uid}
                  layout
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className={`group flex items-center gap-2 rounded-2xl bg-white/10 py-2 pr-2 pl-3 ${p.connected === false ? 'opacity-40' : ''}`}
                >
                  <Avatar id={p.avatar} name={p.name} />
                  <span className="text-xl font-bold">{p.name}</span>
                  {isSuspicious(p.name) && <span title={t.host.flaggedName} className="text-accent2"><Icon.warn /></span>}
                  <button
                    type="button"
                    onClick={() => void ctrl.kick(uid)}
                    className="ml-1 rounded-lg px-2 py-1 text-sm text-white/50 hover:bg-bad hover:text-white"
                    aria-label={`${t.host.kick} ${p.name}`}
                  >
                    <Icon.close />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-xl border border-line bg-ink2/60 p-6">
        <h2 className="text-2xl font-black">{t.host.plan}</h2>
        <div className="flex flex-wrap gap-2">
          {PLAN_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => pickTemplate(tpl.id)}
              className={`rounded-xl px-4 py-2 font-bold ${templateId === tpl.id ? 'bg-accent text-ink' : 'bg-white/10'}`}
            >
              {t.templates[tpl.id]} <span className="font-normal opacity-70">~{tpl.minutes} min</span>
            </button>
          ))}
          <span className={`rounded-xl px-4 py-2 font-bold ${templateId === 'custom' ? 'bg-accent text-ink' : 'bg-white/5 text-white/50'}`}>
            {t.host.custom}
          </span>
        </div>

        <ol className="flex flex-col gap-2">
          {plan.map((item, i) => {
            const mode = MODES[item.mode];
            const tooFew = n < mode.minPlayers;
            return (
              <li key={i} className={`flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2 ${tooFew ? 'opacity-60' : ''}`}>
                <span className="w-6 text-center font-black text-white/50">{i + 1}</span>
                <select
                  value={item.mode}
                  onChange={(e) => edit(i, { mode: e.target.value as ModeId, count: DEFAULT_COUNTS[e.target.value as ModeId], options: {} })}
                  className="rounded-lg bg-ink2 px-2 py-2 font-bold"
                  aria-label="Pelimuoto"
                >
                  {MODE_IDS.map((m) => (
                    <option key={m} value={m}>
                      {t.modes[m].name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-sm text-white/70">
                  {item.mode === 'duel' ? t.host.duelCount : t.host.count}
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={item.count}
                    onChange={(e) => edit(i, { count: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                    className="w-14 rounded-lg bg-ink2 px-2 py-2 text-center font-bold text-white"
                  />
                </label>
                {item.mode === 'estimate' && (
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={item.options?.estimateVariant === 'under'}
                      onChange={(e) => edit(i, { options: { estimateVariant: e.target.checked ? 'under' : 'closest' } })}
                    />
                    {t.host.variantUnder}
                  </label>
                )}
                {item.mode === 'duel' && (
                  <select
                    value={item.options?.duelPairing ?? 'top-vs-random'}
                    onChange={(e) => edit(i, { options: { duelPairing: e.target.value as any } })}
                    className="rounded-lg bg-ink2 px-2 py-2 text-sm"
                    aria-label={t.host.pairing}
                  >
                    {Object.entries(t.host.pairings).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
                {tooFew && <span className="text-xs text-accent2">{t.host.minPlayersNote(mode.minPlayers)}</span>}
                <button
                  type="button"
                  onClick={() => {
                    setTemplateId('custom');
                    setPlan((p) => p.filter((_, j) => j !== i));
                  }}
                  className="ml-auto rounded-lg px-2 py-1 text-white/50 hover:bg-bad hover:text-white"
                  aria-label={t.host.remove}
                >
                  <Icon.close />
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          variant="ghost"
          onClick={() => {
            setTemplateId('custom');
            setPlan((p) => [...p, { mode: 'classic', count: DEFAULT_COUNTS.classic }]);
          }}
          disabled={plan.length >= 8}
        >
          {t.host.addRound}
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <label className="font-bold" htmlFor="pack">
            {t.host.pack}
          </label>
          <select id="pack" value={packId} onChange={(e) => setPackId(e.target.value)} className="rounded-lg bg-ink2 px-3 py-2">
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.classic.length + p.estimate.length + p.bluff.length})
              </option>
            ))}
          </select>
          <label className="cursor-pointer rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20">
            {t.host.importJson}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])}
            />
          </label>
        </div>
        {importMsg && <p className={`text-sm ${importMsg.ok ? 'text-good' : 'text-bad'}`}>{importMsg.text}</p>}

        {extraSettings}
        {showSpeed && (
          <label className="flex items-center gap-2 text-sm text-white/60">
            {t.host.speed}
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded bg-ink2 px-2 py-1" data-testid="speed">
              {[1, 0.5, 0.25, 0.1].map((s) => (
                <option key={s} value={s}>
                  ×{1 / s}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-auto">
          <Button
            className="w-full text-2xl"
            disabled={n < MIN_TO_START || plan.length === 0}
            onClick={() => void ctrl.start(plan, pack, speed)}
          >
            {n < MIN_TO_START ? t.host.needPlayers(MIN_TO_START) : t.host.start}
          </Button>
        </div>
      </section>
    </div>
  );
}
