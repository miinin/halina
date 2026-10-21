import { useState } from 'react';
import { t } from '../i18n/fi.ts';
import { isMuted, setMuted } from '../lib/sound.ts';
import { Button } from '../components/ui.tsx';
import { Icon } from '../components/icons.tsx';
import type { HostLike as HostController } from './controller.ts';

export function Controls({ ctrl, navClass = 'fixed inset-x-0 bottom-0' }: { ctrl: HostController; navClass?: string }) {
  const [muted, setM] = useState(isMuted());
  const [modOpen, setModOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const s = ctrl.state;
  const podium = ctrl.game?.stage === 'podium';
  const texts = ctrl.freeTexts();
  const flagged = texts.filter((x) => x.flagged && !x.hidden && !ctrl.reviewed.has(x.uid)).length;
  const isBluff = s?.input === 'text' || s?.phase === 'choose';

  return (
    <>
      {modOpen && isBluff && (
        <aside className="fixed right-4 bottom-20 z-30 max-h-[60vh] w-96 overflow-auto rounded-2xl bg-ink2 p-4 shadow-2xl ring-1 ring-white/20">
          <h2 className="mb-3 font-black">{t.host.moderation}</h2>
          {texts.length === 0 && <p className="text-white/60">{t.host.moderationEmpty}</p>}
          <ul className="flex flex-col gap-2">
            {texts.map((x) => (
              <li key={x.uid} className={`flex items-center gap-2 rounded-lg p-2 ${x.flagged ? 'bg-bad/20' : 'bg-white/5'}`}>
                <span className={`flex-1 ${x.hidden ? 'line-through opacity-50' : ''} ${x.flagged && !ctrl.reviewed.has(x.uid) ? 'blur-sm hover:blur-none' : ''}`}>
                  {x.text}
                </span>
                <span className="text-xs text-white/50">{ctrl.roster[x.uid]?.name}</span>
                {x.flagged && !x.hidden && !ctrl.reviewed.has(x.uid) && (
                  <button type="button" className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => ctrl.markReviewed(x.uid)}>
                    OK
                  </button>
                )}
                {!x.hidden ? (
                  <button type="button" className="rounded bg-bad px-2 py-1 text-xs font-bold" onClick={() => void ctrl.hideText(x.uid)}>
                    {t.host.hide}
                  </button>
                ) : (
                  <span className="text-xs">{t.host.hidden}</span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
      <nav className={`${navClass} z-20 flex items-center gap-2 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur`}>
        {!podium && s && (
          <>
            {s.paused ? (
              <Button onClick={() => void ctrl.resume()}><Icon.play /> {t.host.continue}</Button>
            ) : (
              <Button variant="ghost" onClick={() => void ctrl.pause()}>
                <Icon.pause /> {t.host.pause}
              </Button>
            )}
            <Button variant="ghost" onClick={() => void ctrl.next()} disabled={s.paused}>
              <Icon.skip /> {t.host.skip}
            </Button>
          </>
        )}
        {isBluff && (
          <Button variant={flagged ? 'danger' : 'ghost'} onClick={() => setModOpen((o) => !o)}>
            <Icon.shield /> {t.host.moderation}
            {flagged > 0 && ` (${flagged})`}
          </Button>
        )}
        {podium && (
          <Button onClick={() => void ctrl.rematch()} className="text-xl">
            <Icon.repeat /> {t.host.rematch}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setMuted(!muted);
              setM(!muted);
            }}
            aria-label={muted ? t.host.unmute : t.host.mute}
          >
            {muted ? <Icon.mute /> : <Icon.sound />}
          </Button>
          <Button
            variant={confirmEnd ? 'danger' : 'ghost'}
            onClick={() => {
              if (podium || confirmEnd) {
                setConfirmEnd(false);
                void ctrl.toLobby();
              } else {
                setConfirmEnd(true);
                setTimeout(() => setConfirmEnd(false), 4000);
              }
            }}
          >
            {podium ? t.host.toLobby : confirmEnd ? t.host.confirmEnd : t.host.endGame}
          </Button>
        </div>
      </nav>
    </>
  );
}
