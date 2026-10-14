import { describe, it, expect } from "vitest";
import { act, auto, newSession, viewOf, archive, stateOf } from "./engine";
import {
  presentView,
  relativeSeat,
  ownTotals,
  actualAction,
} from "./presentation";
import { SEATS, type Seat } from "./types";
import { exportMatch, importMatch } from "./transfer";
describe("online perspective", () => {
  it.each(SEATS)(
    "keeps %s own hand at the bottom while preserving actual server identity",
    (self: Seat) => {
      let snapshot = newSession(7, "SOUTH").snapshot;
      snapshot = act(snapshot, {
        type: "bid",
        seat: "WEST",
        amount: 8,
        trump: "HEARTS",
      });
      for (let index = 0; index < 4; index++)
        snapshot = auto(snapshot, viewOf(snapshot).auction.turn);
      for (let index = 0; index < 4; index++)
        snapshot = auto(snapshot, viewOf(snapshot).turn);
      const raw = viewOf(snapshot, self),
        view = presentView(raw);
      expect(view.seat).toBe("SOUTH");
      expect(view.hand).toEqual(raw.hand);
      expect(raw.seat).toBe(self);
      expect(view.tricks[0].plays.map((play) => play.seat)).toEqual(
        raw.tricks[0].plays.map((play) => relativeSeat(play.seat, self)),
      );
      expect(new Set(view.tricks[0].plays.map((play) => play.seat)).size).toBe(
        4,
      );
      expect(actualAction({ type: "pass", seat: "SOUTH" }, self).seat).toBe(
        self,
      );
    },
  );
  it("shows East/West team as ours without mutating the authoritative score", () => {
    const score = { northSouth: 20, eastWest: 40 };
    expect(ownTotals(score, "WEST")).toEqual({ northSouth: 40, eastWest: 20 });
    expect(score.northSouth).toBe(20);
  });
  it("round-trips a completed online record with seat and player names and recomputed score", () => {
    const session = newSession(4, "SOUTH");
    session.snapshot = act(session.snapshot, {
      type: "bid",
      seat: "WEST",
      amount: 400,
      trump: "HEARTS",
    });
    for (let i = 0; i < 4; i++)
      session.snapshot = auto(
        session.snapshot,
        viewOf(session.snapshot).auction.turn,
      );
    while (stateOf(session.snapshot).phase === "PLAYING")
      session.snapshot = auto(session.snapshot, viewOf(session.snapshot).turn);
    const saved = {
      ...archive(session),
      seat: "WEST" as const,
      source: "online" as const,
      timerSeconds: 60,
      players: { SOUTH: "Один", WEST: "Два", NORTH: "Три", EAST: "Четыре" },
    };
    const imported = importMatch(exportMatch(saved));
    expect(imported.seat).toBe("WEST");
    expect(imported.players).toEqual(saved.players);
    expect(imported.scores).toEqual(saved.scores);
    expect(exportMatch(imported)).not.toContain("token");
  });
});
