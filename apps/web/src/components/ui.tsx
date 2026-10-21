import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { AVATARS } from '../lib/shared.ts';
import { Icon } from './icons.tsx';
import { t } from '../i18n/fi.ts';

export const SHAPES = ['▲', '◆', '●', '■'] as const;
export const SHAPE_NAMES = ['kolmio', 'vinoneliö', 'ympyrä', 'neliö'] as const;
export const OPTION_BG = ['bg-opt0', 'bg-opt1', 'bg-opt2', 'bg-opt3'] as const;

export function initials(name = '') {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/** Nimikirjaimet tunnusvärin päällä. Haamu = katkoviivareunus ilman täyttöä. */
export function Avatar({
  id,
  name = '',
  size = 'md',
  ghost = false,
}: {
  id: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  ghost?: boolean;
}) {
  const box = { sm: 'h-7 w-7 text-[0.7rem]', md: 'h-9 w-9 text-sm', lg: 'h-14 w-14 text-xl', xl: 'h-20 w-20 text-3xl' }[size];
  const color = AVATARS[id] ?? '#7a8a99';
  return (
    <span
      aria-hidden
      className={`${box} inline-grid shrink-0 place-items-center rounded-full font-display font-extrabold leading-none tracking-tight ${ghost ? 'border-2 border-dashed text-paper/60' : 'text-white'}`}
      style={ghost ? { borderColor: color } : { background: color }}
    >
      {initials(name)}
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
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-ink2 py-1 pr-3 pl-1 ${dim || p.connected === false ? 'opacity-40' : ''}`}
    >
      <Avatar id={p.avatar} name={p.name} size="sm" ghost={p.alive === false} />
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
  const ring = state === 'correct' ? 'ring-4 ring-white' : selected ? 'ring-4 ring-white' : '';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${SHAPE_NAMES[index]}: ${text}`}
      className={`${OPTION_BG[index]} ${dim} ${ring} relative flex items-center gap-3 rounded-lg text-left text-white transition
        ${big ? 'min-h-16 px-4 py-3 text-xl md:min-h-24 md:px-6 md:py-4 md:text-3xl' : 'min-h-16 px-4 py-3 text-lg'} ${onClick ? 'active:scale-95 disabled:opacity-50' : ''}`}
    >
      <span className={`${big ? 'text-2xl md:text-4xl' : 'text-2xl'} shrink-0 drop-shadow`} aria-hidden>
        {SHAPES[index]}
      </span>
      <span className="font-bold leading-tight">{text}</span>
      {count !== undefined && <span className="ml-auto text-2xl font-black tabular-nums">{count}</span>}
      {state === 'correct' && (
        <span className="ml-2 grid h-8 w-8 place-items-center rounded-full bg-white text-ink">
          <Icon.check />
        </span>
      )}
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
      <span className={`tabular-nums font-black ${big ? 'text-2xl w-14 md:text-4xl md:w-20' : 'text-xl w-12'} text-right ${urgent ? 'text-accent2' : ''}`}>
        {paused ? <Icon.pause /> : secs}
      </span>
    </div>
  );
}

export function Pop({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
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
    primary: 'bg-accent text-ink hover:brightness-105',
    ghost: 'border border-line bg-ink2 text-paper hover:border-paper/30',
    danger: 'bg-bad text-white hover:brightness-110',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${v} inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}
