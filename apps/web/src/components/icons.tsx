/** Pienet viivaikonit (currentColor). */
const P = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icon = {
  pause: () => (
    <svg {...P} aria-hidden>
      <path d="M8 5v14M16 5v14" />
    </svg>
  ),
  play: () => (
    <svg {...P} aria-hidden>
      <path d="M7 5l12 7-12 7z" fill="currentColor" />
    </svg>
  ),
  skip: () => (
    <svg {...P} aria-hidden>
      <path d="M5 5l10 7-10 7zM19 5v14" />
    </svg>
  ),
  sound: () => (
    <svg {...P} aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />
    </svg>
  ),
  mute: () => (
    <svg {...P} aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" />
    </svg>
  ),
  shield: () => (
    <svg {...P} aria-hidden>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </svg>
  ),
  repeat: () => (
    <svg {...P} aria-hidden>
      <path d="M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4" />
    </svg>
  ),
  check: () => (
    <svg {...P} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  ),
  close: () => (
    <svg {...P} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  warn: () => (
    <svg {...P} aria-hidden>
      <path d="M12 3l10 18H2zM12 10v4M12 17.5v.5" />
    </svg>
  ),
};
