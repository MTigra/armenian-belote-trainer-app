import type {
  Action,
  GameEvent,
  PlayerView,
  Seat,
  Totals,
  PlayerPresence,
} from "./types";
import { SEATS, names } from "./types";
import type { TableSnapshot } from "./onlineTypes";
export function relativeSeat(seat: Seat, self: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) - SEATS.indexOf(self) + 4) % 4];
}
export function ownTotals(totals: Totals, self: Seat): Totals {
  if (SEATS.indexOf(self) % 2 === 0) return totals;
  return { northSouth: totals.eastWest, eastWest: totals.northSouth };
}
export function playerNames(
  table: TableSnapshot,
  relative = true,
): Record<Seat, string> {
  const result = { ...names };
  for (const member of table.members)
    result[relative ? relativeSeat(member.seat, table.selfSeat) : member.seat] =
      member.seat === table.selfSeat ? "Вы" : member.nickname;
  return result;
}
export function playerPresence(table: TableSnapshot): PlayerPresence {
  return Object.fromEntries(
    table.members.map((member) => [
      relativeSeat(member.seat, table.selfSeat),
      { connected: member.connected, bot: member.bot },
    ]),
  );
}
export function presentView(view: PlayerView): PlayerView {
  const seat = (value: Seat) => relativeSeat(value, view.seat);
  const totals = (value: Totals) => ownTotals(value, view.seat);
  const contract = (value: PlayerView["auction"]["contract"]) =>
    value ? { ...value, bidder: seat(value.bidder) } : null;
  const event = (value: GameEvent): GameEvent => ({
    ...value,
    seat: value.seat ? seat(value.seat) : null,
    contract: contract(value.contract),
    declaration: value.declaration
      ? { ...value.declaration, owner: seat(value.declaration.owner) }
      : null,
    announcement: value.announcement
      ? { ...value.announcement, owner: seat(value.announcement.owner) }
      : null,
    totals: value.totals ? totals(value.totals) : null,
  });
  return {
    ...view,
    seat: "SOUTH",
    dealer: seat(view.dealer),
    turn: seat(view.turn),
    scores: totals(view.scores),
    currentPoints: view.currentPoints ? totals(view.currentPoints) : undefined,
    options: {
      ...view.options,
      declarationsToShow: view.options.declarationsToShow?.map((d) => ({
        ...d,
        owner: seat(d.owner),
      })),
    },
    handSizes: Object.fromEntries(
      SEATS.map((s) => [seat(s), view.handSizes[s]]),
    ) as Record<Seat, number>,
    auction: {
      ...view.auction,
      turn: seat(view.auction.turn),
      contract: contract(view.auction.contract),
      pendingRedouble: view.auction.pendingRedouble.map(seat),
    },
    trick: view.trick.map((p) => ({ ...p, seat: seat(p.seat) })),
    tricks: view.tricks.map((t) => ({
      ...t,
      winner: seat(t.winner),
      plays: t.plays.map((p) => ({ ...p, seat: seat(p.seat) })),
    })),
    publicDeclarations: view.publicDeclarations.map((d) => ({
      ...d,
      owner: seat(d.owner),
    })),
    shownDeclarations: view.shownDeclarations.map((d) => ({
      ...d,
      owner: seat(d.owner),
    })),
    events: view.events.map(event),
  };
}
export function actualAction(action: Action, self: Seat): Action {
  return { ...action, seat: self };
}
