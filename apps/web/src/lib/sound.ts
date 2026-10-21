/** Äänet syntetisoidaan WebAudiolla – ei äänitiedostoja ladattavaksi. */
type Note = [freq: number, startS: number, durS: number, type?: OscillatorType, gain?: number];

const KEY = 'halina.muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    /* ei tallennusta */
  }
}

function play(notes: Note[]) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (const [f, s, d, type = 'sine', g = 0.15] of notes) {
      const o = ctx.createOscillator();
      const v = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      v.gain.setValueAtTime(0, t0 + s);
      v.gain.linearRampToValueAtTime(g, t0 + s + 0.01);
      v.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
      o.connect(v).connect(ctx.destination);
      o.start(t0 + s);
      o.stop(t0 + s + d + 0.05);
    }
  } catch {
    /* ei ääntä */
  }
}

export const sfx = {
  tick: () => play([[880, 0, 0.06, 'square', 0.05]]),
  whoosh: () => play([[220, 0, 0.25, 'sawtooth', 0.04], [330, 0.05, 0.25, 'sine', 0.08]]),
  reveal: () => play([[523, 0, 0.15], [659, 0.1, 0.15], [784, 0.2, 0.3]]),
  join: () => play([[660, 0, 0.08, 'triangle'], [990, 0.07, 0.12, 'triangle']]),
  doom: () => play([[196, 0, 0.4, 'sawtooth', 0.08], [147, 0.3, 0.6, 'sawtooth', 0.08]]),
  fanfare: () =>
    play([
      [523, 0, 0.18, 'triangle'], [659, 0.18, 0.18, 'triangle'], [784, 0.36, 0.18, 'triangle'],
      [1047, 0.54, 0.6, 'triangle', 0.2], [784, 0.54, 0.6, 'sine', 0.1],
    ]),
};
