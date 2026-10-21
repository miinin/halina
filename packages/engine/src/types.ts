export type Uid = string;

export type ModeId = 'classic' | 'wager' | 'bluff' | 'survivor' | 'estimate' | 'duel';

export interface Player {
  uid: Uid;
  name: string;
  avatar: string;
  score: number;
  /** false = haamu (Selviytyjä). Muissa muodoissa aina true. */
  alive: boolean;
  connected: boolean;
}

// ---------- Kysymykset ----------

export interface McQuestion {
  id: string;
  category: string;
  prompt: string;
  /** 2–4 vaihtoehtoa */
  options: string[];
  /** oikean vaihtoehdon indeksi options-taulukossa */
  correct: number;
}

export interface EstimateQuestion {
  id: string;
  category?: string;
  prompt: string;
  unit?: string;
  answer: number;
}

export interface BluffQuestion {
  id: string;
  category?: string;
  /** Kysymys, jossa aukko merkitään ____ */
  prompt: string;
  answer: string;
  /** Muut hyväksytyt muodot totuudesta (hylätään valheina) */
  accepted?: string[];
  /** Valmiit "talon valheet" */
  houseLies: string[];
}

export interface QuestionPack {
  id: string;
  name: string;
  language: string;
  classic: McQuestion[];
  estimate: EstimateQuestion[];
  bluff: BluffQuestion[];
}

export interface QuestionNeeds {
  classic: number;
  estimate: number;
  bluff: number;
}

export interface QuestionSet {
  classic: McQuestion[];
  estimate: EstimateQuestion[];
  bluff: BluffQuestion[];
}

// ---------- Kierrokset ----------

export type DuelPairing = 'top-vs-random' | 'bottom-two' | 'random';

export interface RoundOptions {
  /** Arvio: "Ylittämättä"-variantti */
  estimateVariant?: 'closest' | 'under';
  duelPairing?: DuelPairing;
}

export interface PlanItem {
  mode: ModeId;
  /** kysymysten (tai kaksintaistelujen) määrä */
  count: number;
  options?: RoundOptions;
}

// ---------- Vaiheet ----------

export type InputKind =
  | 'mc' // number: vaihtoehdon indeksi
  | 'wager' // number: panos
  | 'number' // number: arvio
  | 'text' // string: bluffi
  | 'choice' // string: vaihtoehdon id
  | 'door' // number 0..2
  | 'math' // number[3]
  | 'vote' // string: uid
  | 'bet'; // string: uid

export type Audience = 'all' | 'alive' | Uid[];

export interface PhaseSpec<V = PhaseView> {
  /** vaiheen nimi, esim. 'question', 'reveal' */
  name: string;
  /** 0 = ei aikarajaa */
  durationMs: number;
  input: InputKind | null;
  audience: Audience;
  view: V;
}

/** Julkinen näkymä: kaikki pelaajat ja iso näyttö näkevät tämän. Ei saa sisältää salaisuuksia. */
export type PhaseView = { kind: string } & Record<string, unknown>;

export interface TimedInput<T = unknown> {
  value: T;
  /** millisekunteja vaiheen alusta */
  ms: number;
}

export type Rejection = { ok: false; reason: RejectReason };
export type Accepted<T> = { ok: true; value: T };
export type Validation<T = unknown> = Accepted<T> | Rejection;

export type RejectReason =
  | 'no-input'
  | 'not-in-audience'
  | 'invalid'
  | 'too-close'
  | 'too-long'
  | 'empty'
  | 'own-lie'
  | 'out-of-range'
  | 'self-vote';

export interface Resolution {
  deltas: Record<Uid, number>;
  patches?: Record<Uid, Partial<Pick<Player, 'alive'>>>;
}

export interface GameStats {
  /** perusvisan putki */
  streak: Record<Uid, number>;
  /** kuinka monta kertaa pelaaja lankesi bluffiin */
  fooled: Record<Uid, number>;
  /** kuinka monta pelaajaa pelaaja huijasi */
  fooledOthers: Record<Uid, number>;
  /** suurin yksittäinen panos suhteessa pisteisiin (0..1+) */
  bravest: Record<Uid, number>;
  /** selvityt kellarit */
  cellarSurvived: Record<Uid, number>;
  /** pisteet kierroksen alussa (välitulostaulua varten) */
  roundStartScores: Record<Uid, number>;
}

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
}

export interface RoundContext {
  players: Record<Uid, Player>;
  rng: Rng;
  stats: GameStats;
  options: RoundOptions;
  /** kierroksen järjestysnumero (0-pohjainen) – stepKey-tunnisteisiin */
  round: number;
}

export interface RoundInit extends RoundContext {
  questions: QuestionSet;
  count: number;
}

/**
 * Pelimuoto. Moottori kloonaa koko pelitilan ennen jokaista kutsua, joten
 * moduuli saa muokata omaa tilaansa (s) suoraan.
 */
export interface GameMode<S = any> {
  id: ModeId;
  minPlayers: number;
  needs(count: number, playerCount: number): QuestionNeeds;
  init(ctx: RoundInit): S;
  nextPhase(s: S, ctx: RoundContext): PhaseSpec | 'round-end';
  validateInput(s: S, phase: PhaseSpec, raw: unknown, p: Player, ctx: RoundContext): Validation;
  resolve(s: S, phase: PhaseSpec, inputs: Record<Uid, TimedInput>, ctx: RoundContext): Resolution;
  /** kierroksen lopun bonukset (esim. selviytymisbonus) */
  finish?(s: S, ctx: RoundContext): Resolution;
  /** oikea vastaus nykyiseen vaiheeseen – vain hostOnly-puuhun (botit ja debug) */
  answerKey?(s: S, phase: PhaseSpec): unknown;
  /** hostin moderointi: piilota pelaajan vapaateksti. Palauttaa uuden näkymän, jos se muuttui. */
  moderate?(s: S, phase: PhaseSpec, uid: Uid, ctx: RoundContext): PhaseView | null;
}
