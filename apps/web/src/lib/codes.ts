/** 22 kirjainta: O, I, L ja Q poistettu → 22⁴ ≈ 234 000 koodia */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPRSTUVWXYZ';
export const CODE_RE = /^[A-HJKMNPR-Z]{4}$/;
export function randomCode(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return [...a].map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

