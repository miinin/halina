import {
  AlertTriangle,
  Check,
  Coins,
  DoorClosed,
  Flame,
  Ghost,
  Pause,
  Play,
  Repeat,
  ShieldCheck,
  SkipForward,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

const s = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const;

/** Lucide-ikonit (currentColor). */
export const Icon = {
  pause: () => <Pause {...s} />,
  play: () => <Play {...s} />,
  skip: () => <SkipForward {...s} />,
  sound: () => <Volume2 {...s} />,
  mute: () => <VolumeX {...s} />,
  shield: () => <ShieldCheck {...s} />,
  repeat: () => <Repeat {...s} />,
  check: () => <Check {...s} />,
  close: () => <X {...s} />,
  warn: () => <AlertTriangle {...s} />,
};

/** Isommat symbolit ison näytön ja puhelimen näkymiin. */
export const Sym = { Coins, DoorClosed, Flame, Ghost, Swords, Trophy };
