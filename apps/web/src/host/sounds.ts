import { useEffect, useRef } from 'react';
import { sfx } from '../lib/sound.ts';
import type { HostController } from './controller.ts';

/** Äänet isolla näytöllä vaiheen vaihtuessa ja viimeisillä sekunneilla. */
export function useHostSounds(ctrl: HostController) {
  const lastStep = useRef('');
  const lastTick = useRef(-1);
  const roster = useRef(0);

  const step = ctrl.state?.stepKey ?? '';
  const kind = (ctrl.game?.phase?.view.kind as string | undefined) ?? 'lobby';
  const players = Object.keys(ctrl.roster).length;

  useEffect(() => {
    if (players > roster.current && kind === 'lobby') sfx.join();
    roster.current = players;
  }, [players, kind]);

  useEffect(() => {
    if (!step || step === lastStep.current) return;
    lastStep.current = step;
    if (kind === 'podium') sfx.fanfare();
    else if (kind === 'cellar' || kind === 'cellar-verdict') sfx.doom();
    else if (kind.endsWith('reveal') || kind === 'duel-result' || kind === 'scoreboard') sfx.reveal();
    else sfx.whoosh();
  }, [step, kind]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = ctrl.state;
      if (!s || s.paused || !s.input || s.durationMs <= 0) return;
      const secs = Math.ceil((s.deadline - ctrl.now()) / 1000);
      if (secs <= 5 && secs > 0 && secs !== lastTick.current) {
        lastTick.current = secs;
        sfx.tick();
      }
    }, 100);
    return () => clearInterval(id);
  }, [ctrl]);
}
