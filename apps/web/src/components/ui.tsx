import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { AVATARS } from '../lib/room.ts';
import { t } from '../i18n/fi.ts';

export const SHAPES = ['▲', '◆', '●', '■'] as const;
export const SHAPE_NAMES = ['kolmio', 'vinoneliö', 'ympyrä', 'neliö'] as const;
export const OPTION_BG = ['bg-opt0', 'bg-opt1', 'bg-opt2', 'bg-opt3'] as const;

export function Avatar({ id, size = 'md', ghost = false }: { id: string; size?: 'sm' | 'md' | 'lg' | 'xl'; ghost?: boolean }) {
  const cls = { sm: 'text-xl', md: 'text-3xl', lg: 'text-5xl', xl: 'text-7xl' }[size];
  return (
    <span className={`${cls} leading-none inline-block ${ghost ? 'opacity-50 grayscale' : ''}`} aria-hidden>
      {ghost ? '👻' : (AVATARS[id] ?? '🙂')}
    </span>
  );
}

export interface PlayerLike {
  name: string;
  avatar: string;
  alive?: boolean;
  connected?: boolean;
}

export function PlayerChip({ p, extra, dim }: { p: PlayerLike | undefined; extra?: ReactNode; dim?: boolean }) {
  if (!p) return null;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ${dim || p.connected === false ? 'opacity-40' : ''}`}
    >
      <Avatar id={p.avatar} size="sm" ghost={p.alive === false} />
      <span className="font-semibold truncate max-w-[10ch]">{p.name}</span>
      {extra}
    </span>
  );
}

export function OptionTile({
  index,
  text,
  state = 'idle',
  count,
  big = false,
  onClick,
  disabled,
  selected,
}: {
  index: number;
  text: string;
  state?: 'idle' | 'correct' | 'wrong';
  count?: number;
  big?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const dim = state === 'wrong' ? 'opacity-30' : '';
  const ring = state === 'correct' ? 'ring-4 ring-white scale-[1.02]' : selected ? 'ring-4 ring-white' : '';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${SHAPE_NAMES[index]}: ${text}`}
      className={`${OPTION_BG[index]} ${dim} ${ring} relative flex items-center gap-3 rounded-2xl text-left text-white shadow-lg transition
        ${big ? 'min-h-24 px-6 py-4 text-3xl' : 'min-h-16 px-4 py-3 text-lg'} ${onClick ? 'active:scale-95 disabled:opacity-50' : ''}`}
    >
      <span className={`${big ? 'text-4xl' : 'text-2xl'} shrink-0 drop-shadow`} aria-hidden>
        {SHAPES[index]}
      </span>
      <span className="font-bold leading-tight">{text}</span>
      {count !== undefined && <span className="ml-auto text-2xl font-black tabular-nums">{count}</span>}
      {state === 'correct' && <span className="ml-2 text-3xl" aria-hidden>✓</span>}
    </Comp>
  );
}

export function TimerBar({
  remainingMs,
  durationMs,
  paused,
  big = false,
}: {
  remainingMs: number;
  durationMs: number;
  paused: boolean;
  big?: boolean;
}) {
  if (durationMs <= 0) return null;
  const frac = Math.max(0, Math.min(1, remainingMs / durationMs));
  const secs = Math.ceil(remainingMs / 1000);
  const urgent = secs <= 5;
  return (
    <div className="flex items-center gap-3 w-full" role="timer" aria-live="off">
      <div className={`flex-1 rounded-full bg-white/15 overflow-hidden ${big ? 'h-4' : 'h-2.5'}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-accent2' : 'bg-accent'}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span className={`tabular-nums font-black ${big ? 'text-4xl w-20' : 'text-xl w-12'} text-right ${urgent ? 'text-accent2' : ''}`}>
        {paused ? '⏸' : secs}
      </span>
    </div>
  );
}

export function Pop({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Delta({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`font-black tabular-nums ${n > 0 ? 'text-good' : n < 0 ? 'text-bad' : 'text-white/50'} ${className}`}>
      {t.common.signed(n)}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const v = {
    primary: 'bg-accent text-ink hover:brightness-110',
    ghost: 'bg-white/10 text-white hover:bg-white/20',
    danger: 'bg-bad text-white hover:brightness-110',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${v} min-h-12 rounded-xl px-5 py-3 font-bold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}
