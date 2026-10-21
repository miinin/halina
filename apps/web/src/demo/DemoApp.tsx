import { useEffect, useMemo, useState } from 'react';
import { PLAN_TEMPLATES } from '@halina/engine';
import { BUILTIN_PACKS } from '@halina/content';
import { t } from '../i18n/fi.ts';
import { AVATAR_IDS } from '../lib/shared.ts';
import { Avatar, Button } from '../components/ui.tsx';
import { Stage } from '../host/Stage.tsx';
import { Controls } from '../host/Controls.tsx';
import { useHostSounds } from '../host/sounds.ts';
import { PlayerScreen, inAudience } from '../play/PlayerScreen.tsx';
import { parsePhase } from '../lib/shared.ts';
import { DemoController, ME } from './DemoController.ts';

const SPEEDS = [
  { id: 1, label: 'Normaali' },
  { id: 0.5, label: 'Nopea' },
];

const TEMPLATE_PLANS = {
  quick: 'Perusvisa → Arvio → Bluffi → Panos',
  full: 'Perusvisa → Bluffi → Selviytyjä → Arvio → Kaksintaistelu → Panos',
  classroom: 'Perusvisa → Arvio → Selviytyjä',
} as const;

export function DemoApp() {
  const [ctrl, setCtrl] = useState<DemoController | null>(null);
  useEffect(() => () => ctrl?.dispose(), [ctrl]);
  if (!ctrl) return <Setup onStart={setCtrl} />;
  return <DemoGame ctrl={ctrl} onExit={() => setCtrl(null)} />;
}

function Setup({ onStart }: { onStart: (c: DemoController) => void }) {
  const [name, setName] = useState('Minä');
  const [avatar, setAvatar] = useState('fox');
  const [bots, setBots] = useState(5);
  const [template, setTemplate] = useState<(typeof PLAN_TEMPLATES)[number]['id']>('full');
  const [speed, setSpeed] = useState(1);

  const start = () => {
    const c = new DemoController(name.trim() || 'Minä', avatar, bots);
    onStart(c);
    void c.start(PLAN_TEMPLATES.find((p) => p.id === template)!.plan, BUILTIN_PACKS[0], speed);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 py-10" style={{ paddingInline: 'max(16px, env(safe-area-inset-left, 0px))' }}>
      <header className="flex flex-col gap-3">
        <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-widest text-accent uppercase">Demo</span>
        <h1 className="text-6xl font-black tracking-tight">
          H<span className="text-accent2">ä</span>lin<span className="text-accent">ä</span>
        </h1>
        <p className="max-w-prose text-lg text-white/75">
          Seurapelivisa, jossa panostetaan, bluffataan ja selviydytään kellarista. Tässä demossa iso näyttö ja oma puhelimesi ovat
          rinnakkain, ja muut pelaajat ovat botteja. Oikeassa pelissä kaverit liittyvät omilla puhelimillaan neljän kirjaimen koodilla.
        </p>
      </header>

      <form
        className="grid gap-6 rounded-3xl bg-white/5 p-6 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1" htmlFor="demo-name">
            <span className="text-sm font-semibold text-white/70">{t.join.name}</span>
            <input
              id="demo-name"
              value={name}
              maxLength={12}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              className="h-12 rounded-xl bg-white px-4 text-xl font-bold text-ink"
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
                  className={`grid aspect-square min-h-10 place-items-center rounded-xl ${avatar === id ? 'bg-accent' : 'bg-white/10'}`}
                >
                  <Avatar id={id} size="sm" />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1" htmlFor="demo-bots">
            <span className="text-sm font-semibold text-white/70">Botteja mukana: {bots}</span>
            <input id="demo-bots" type="range" min={2} max={7} value={bots} onChange={(e) => setBots(Number(e.target.value))} className="accent-[var(--color-accent)]" />
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-white/70">{t.host.plan}</legend>
            {PLAN_TEMPLATES.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer flex-col rounded-xl px-4 py-3 ${template === p.id ? 'bg-accent text-ink' : 'bg-white/10'}`}
              >
                <input type="radio" name="tpl" className="sr-only" checked={template === p.id} onChange={() => setTemplate(p.id)} />
                <span className="font-black">
                  {t.templates[p.id]} <span className="font-normal opacity-70">~{Math.round(p.minutes)} min</span>
                </span>
                <span className="text-sm opacity-80">{TEMPLATE_PLANS[p.id]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Tahti</legend>
            <span className="text-sm font-semibold text-white/70">Tahti</span>
            {SPEEDS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSpeed(s.id)}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${speed === s.id ? 'bg-white text-ink' : 'bg-white/10'}`}
              >
                {s.label}
              </button>
            ))}
          </fieldset>
        </div>

        <Button type="submit" className="text-xl md:col-span-2">
          Aloita peli
        </Button>
      </form>
      <p className="text-sm text-white/50">Äänet: isolla näytöllä soi lyhyitä efektejä. Mykistys löytyy alapalkista.</p>
    </main>
  );
}

function useCtrl(ctrl: DemoController) {
  const [, force] = useState(0);
  useEffect(() => ctrl.subscribe(() => force((x) => x + 1)), [ctrl]);
}

function DemoGame({ ctrl, onExit }: { ctrl: DemoController; onExit: () => void }) {
  useCtrl(ctrl);
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
            className={`relative flex-1 rounded-xl py-2 font-bold ${tab === id ? 'bg-accent text-ink' : 'bg-white/10'}`}
          >
            {id === 'stage' ? 'Iso näyttö' : 'Oma puhelin'}
            {id === 'phone' && needsMe && tab !== 'phone' && (
              <span className="absolute -top-1 right-2 rounded-full bg-accent2 px-2 text-xs text-white">Vastaa!</span>
            )}
          </button>
        ))}
      </div>
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className={`relative flex min-w-0 flex-col ${tab === 'stage' ? 'flex' : 'hidden'} lg:flex`} aria-label="Iso näyttö">
          <div className="flex flex-1 flex-col overflow-hidden [&_main]:min-h-0 [&_main]:px-4 [&_main]:pb-6 lg:[&_main]:px-8">
            <Stage ctrl={ctrl} />
          </div>
          <Controls ctrl={ctrl} navClass="sticky bottom-0 flex-wrap" />
        </section>
        <aside
          className={`${tab === 'phone' ? 'flex' : 'hidden'} min-w-0 justify-center bg-black/25 lg:flex lg:items-start lg:py-6`}
          aria-label="Oma puhelin"
        >
          <div className="w-full max-w-md overflow-hidden lg:sticky lg:top-6 lg:h-[780px] lg:w-[370px] lg:rounded-[2.5rem] lg:border-[10px] lg:border-black lg:bg-ink lg:shadow-2xl">
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
