import type { InputKind, Uid } from './types.ts';

const LIES = ['saunakiukaan', 'pullaa', 'hirven', 'Nokia 3310', 'karvalakki', 'mämmiä', 'kalakukko', 'lumilapio', 'kumisaappaat', 'muumimuki', 'salmiakki', 'porokoira', 'tervapulla', 'pikkujoulut'];

/**
 * Bottipelaajan päätös. `answer` on hostin answerKey (oikea vastaus), jota botti käyttää
 * todennäköisyydellä `accuracy`. Käytössä paikallisissa boteissa ja selaindemossa.
 */
export function botAnswer(
  input: InputKind,
  view: Record<string, any>,
  uid: Uid,
  score: number,
  answer: unknown,
  accuracy: number,
  random: () => number = Math.random,
): unknown {
  const rand = (n: number) => Math.floor(random() * n);
  const smart = random() < accuracy;
  switch (input) {
    case 'mc':
      return smart && typeof answer === 'number' ? answer : rand((view.options as string[]).length);
    case 'wager': {
      if (score < 500 && random() < 0.5) return 500;
      return random() < 0.15 ? score : Math.round(score * random() * 0.7);
    }
    case 'number': {
      if (typeof answer !== 'number') return rand(1000);
      const v = answer * (1 + (random() * 2 - 1) * (smart ? 0.15 : 0.8));
      return Math.abs(answer) < 100 ? Math.round(v * 10) / 10 : Math.round(v);
    }
    case 'text':
      return LIES[rand(LIES.length)] + (random() < 0.3 ? ` ${rand(100)}` : '');
    case 'choice': {
      const opts = view.options as { id: string }[];
      return smart && typeof answer === 'string' ? answer : opts[rand(opts.length)].id;
    }
    case 'door':
      return rand(3);
    case 'math':
      return smart && Array.isArray(answer) ? answer : [rand(100), rand(100), rand(100)];
    case 'vote': {
      const others = (view.cellar as string[]).filter((u) => u !== uid);
      return others[rand(others.length)];
    }
    case 'bet':
      return random() < 0.5 ? view.a : view.b;
    default:
      return null;
  }
}
