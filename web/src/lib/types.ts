export type Seat = "SOUTH" | "WEST" | "NORTH" | "EAST";
export type PlayerPresence = Partial<
  Record<Seat, { connected: boolean; bot: boolean }>
>;
export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Rank =
  | "SEVEN"
  | "EIGHT"
  | "NINE"
  | "TEN"
  | "JACK"
  | "QUEEN"
  | "KING"
  | "ACE";
export interface Card {
  suit: Suit;
  rank: Rank;
}
export type Phase =
  | "BIDDING"
  | "REDOUBLE"
  | "PLAYING"
  | "REDEAL_REQUIRED"
  | "DEAL_FINISHED"
  | "MATCH_FINISHED";
export interface Totals {
  northSouth: number;
  eastWest: number;
}
export interface Contract {
  bidder: Seat;
  amount: number;
  trump: Suit | null;
  promisedCaput: boolean;
}
export interface Auction {
  turn: Seat;
  contract: Contract | null;
  consecutivePasses: number;
  multiplier: number;
  pendingRedouble: Seat[];
}
export interface PlayedCard {
  seat: Seat;
  card: Card;
}
export interface Declaration {
  owner: Seat;
  kind: "RUN" | "FOUR" | "FOUR_EIGHTS";
  cards: Card[];
  points: number;
}
export interface PublicDeclaration {
  owner: Seat;
  kind: Declaration["kind"];
  points: number;
  highRank: Rank;
  trumpRun: boolean;
}
export interface WonTrick {
  plays: PlayedCard[];
  winner: Seat;
  cardPoints: number;
}
export interface GameEvent {
  kind: string;
  seat: Seat | null;
  card: Card | null;
  contract: Contract | null;
  declaration: Declaration | null;
  announcement: PublicDeclaration | null;
  totals: Totals | null;
  number: number | null;
}
export interface Options {
  cards: Card[];
  minimumBid: number | null;
  caputRequired: boolean;
  mayPass: boolean;
  mayDouble: boolean;
  mayRedouble: boolean;
  mayDeclineRedouble: boolean;
  mayDeclare?: boolean;
  mayDeclineDeclarations?: boolean;
  declarationsToShow?: Declaration[];
}
export interface PlayerView {
  profileVersion: string;
  phase: Phase;
  dealer: Seat;
  dealNumber: number;
  target: number;
  seat: Seat;
  hand: Card[];
  handSizes: Record<Seat, number>;
  turn: Seat;
  auction: Auction;
  trick: PlayedCard[];
  tricks: WonTrick[];
  scores: Totals;
  currentPoints?: Totals;
  publicDeclarations: PublicDeclaration[];
  shownDeclarations: Declaration[];
  events: GameEvent[];
  options: Options;
}
export type Action =
  | {
      type: "bid";
      seat: Seat;
      amount: number;
      trump: Suit | null;
      caput?: boolean;
    }
  | {
      type:
        | "pass"
        | "double"
        | "redouble"
        | "decline-redouble"
        | "declare"
        | "decline-declarations";
      seat: Seat;
    }
  | { type: "play"; seat: Seat; card: Card };
export interface Setup {
  dealer: Seat;
  hands: Record<Seat, Card[]>;
  actionOffset: number;
}
export interface MatchRecord {
  profileVersion: string;
  formatVersion: number;
  setups: Setup[];
  actions: Action[];
}
/** Full state stays within the local controller; only PlayerView reaches table/coach components. */
export interface GameState {
  profileVersion: string;
  target: number;
  dealer: Seat;
  dealNumber: number;
  phase: Phase;
  initialHands: Record<Seat, Card[]>;
  hands: Record<Seat, Card[]>;
  auction: Auction;
  turn: Seat;
  trick: PlayedCard[];
  tricks: WonTrick[];
  scores: Totals;
  result: { contractSucceeded: boolean; awarded: Totals; base: number } | null;
  winner: "NORTH_SOUTH" | "EAST_WEST" | null;
  events: GameEvent[];
  setups: Setup[];
  actions: Action[];
}
export interface ChatMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  moment: { deal: number; action: number };
  createdAt: number;
  trainerMoment?: import("./trainerTypes").TrainerMoment;
  perspective?: import("./trainerTypes").TrainerPerspective;
  answer?: import("./trainerTypes").TrainerAnswer;
}
export interface Session {
  id: string;
  snapshot: string;
  createdAt: number;
  updatedAt: number;
  chat: ChatMessage[];
}
export interface SavedMatch {
  seat?: Seat;
  players?: Record<Seat, string>;
  source?: "online";
  timerSeconds?: number | null;
  id: string;
  createdAt: number;
  finishedAt: number;
  record: MatchRecord;
  chat: ChatMessage[];
  scores: Totals;
  winner: GameState["winner"];
}
export const SEATS: Seat[] = ["SOUTH", "WEST", "NORTH", "EAST"];
export const SUITS: Suit[] = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];
export const names: Record<Seat, string> = {
  SOUTH: "Вы",
  WEST: "Нарек",
  NORTH: "Давид",
  EAST: "Мариам",
};
export const symbols: Record<Suit, string> = {
  SPADES: "♠",
  HEARTS: "♥",
  DIAMONDS: "♦",
  CLUBS: "♣",
};
export const ranks: Record<Rank, string> = {
  SEVEN: "7",
  EIGHT: "8",
  NINE: "9",
  TEN: "10",
  JACK: "J",
  QUEEN: "Q",
  KING: "K",
  ACE: "A",
};
export const suitNames: Record<Suit, string> = {
  SPADES: "пики",
  HEARTS: "червы",
  DIAMONDS: "бубны",
  CLUBS: "трефы",
};
export const cardKey = (c: Card) => `${c.suit}-${c.rank}`;

export const dealEvents = (events: GameEvent[]) =>
  events.slice(
    Math.max(
      0,
      events.findLastIndex((e) => e.kind === "DEAL_STARTED"),
    ),
  );
