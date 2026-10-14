import type {
  Card,
  Declaration,
  PublicDeclaration,
  PlayerView,
  Seat,
  Suit,
} from "./types";
import { SUITS, SEATS } from "./types";

const trumpOrder = [
  "JACK",
  "NINE",
  "ACE",
  "TEN",
  "KING",
  "QUEEN",
  "EIGHT",
  "SEVEN",
];
const plainOrder = [
  "ACE",
  "TEN",
  "KING",
  "QUEEN",
  "JACK",
  "NINE",
  "EIGHT",
  "SEVEN",
];
export function sortedHand(hand: Card[], trump: Suit | null): Card[] {
  return [...hand].sort((a, b) => {
    const suit = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    const ranks = a.suit === trump ? trumpOrder : plainOrder;
    return suit || ranks.indexOf(a.rank) - ranks.indexOf(b.rank);
  });
}
export function activeSeats(view: PlayerView): Seat[] {
  if (view.phase === "REDOUBLE") return view.auction.pendingRedouble;
  if (view.phase === "BIDDING") return [view.auction.turn];
  return view.phase === "PLAYING" ? [view.turn] : [];
}
export const firstLead = (view: PlayerView): Seat =>
  SEATS[(SEATS.indexOf(view.dealer) + 1) % 4];
export function declarationTitle(d: Declaration | PublicDeclaration): string {
  if (d.kind === "FOUR_EIGHTS") return "4 восьмёрки";
  if (d.kind === "RUN") return d.points === 20 ? "Терц" : String(d.points);
  const rank = "highRank" in d ? d.highRank : d.cards[0]?.rank;
  return `4 ${{ ACE: "туза", KING: "короля", QUEEN: "дамы", JACK: "валета", TEN: "десятки", NINE: "девятки", EIGHT: "восьмёрки", SEVEN: "семёрки" }[rank ?? "SEVEN"]}`;
}
