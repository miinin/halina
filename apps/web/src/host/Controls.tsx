import { useState } from 'react';
import { t } from '../i18n/fi.ts';
import { isMuted, setMuted } from '../lib/sound.ts';
import { Button } from '../components/ui.tsx';
import type { HostController } from './controller.ts';

export function Controls({ ctrl }: { ctrl: HostController }) {
  const [muted, setM] = useState(isMuted());
  const [modOpen, setModOpen] = useState(false);
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
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-ink/90 px-4 py-3 backdrop-blur">
        {!podium && s && (
          <>
            {s.paused ? (
              <Button onClick={() => void ctrl.resume()}>▶ {t.host.continue}</Button>
            ) : (
              <Button variant="ghost" onClick={() => void ctrl.pause()}>
                ⏸ {t.host.pause}
              </Button>
            )}
            <Button variant="ghost" onClick={() => void ctrl.next()} disabled={s.paused}>
              ⏭ {t.host.skip}
            </Button>
          </>
        )}
        {isBluff && (
          <Button variant={flagged ? 'danger' : 'ghost'} onClick={() => setModOpen((o) => !o)}>
            🛡 {t.host.moderation}
            {flagged > 0 && ` (${flagged} ⚠️)`}
          </Button>
        )}
        {podium && (
          <Button onClick={() => void ctrl.rematch()} className="text-xl">
            🔁 {t.host.rematch}
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
            {muted ? '🔇' : '🔊'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (podium || confirm(t.host.confirmEnd)) void ctrl.toLobby();
            }}
          >
            {podium ? t.host.toLobby : t.host.endGame}
          </Button>
        </div>
      </nav>
    </>
  );
}
