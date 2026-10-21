import { normalizeText } from './util.ts';

/**
 * Kevyt kirosanasuodatin (fi/en). Ei estä mitään itse – merkitsee epäilyttävät,
 * jotta host voi piilottaa ne ennen kuin ne näkyvät isolla näytöllä.
 */
/** sanan alku riittää */
const STEMS = [
  'vittu', 'vitun', 'perkele', 'saatana', 'helvet', 'paska', 'kusi', 'mulkku', 'kyrp', 'huora', 'neekeri', 'runkk',
  'pillu', 'perse', 'jumalauta', 'hintti', 'lutka', 'ämmä',
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'asshole', 'nigg', 'whore', 'slut', 'retard', 'bastard',
];
/** vain kokonaisena sanana */
const WORDS = ['dick', 'cock', 'fag', 'homo'];
/** löytyy myös välilyönnein tai yhdyssanan keskeltä */
const STRONG = ['vittu', 'fuck', 'nigg', 'cunt', 'neekeri', 'kyrpä', 'huora'];

export function isSuspicious(text: string): boolean {
  const n = normalizeText(text)
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  const words = n.split(' ');
  const squashed = n.replace(/\s+/g, '');
  return (
    STEMS.some((s) => words.some((w) => w.startsWith(s))) ||
    WORDS.some((s) => words.includes(s)) ||
    STRONG.some((s) => squashed.includes(s))
  );
}
