import { describe, expect, it } from "vitest";
import {
  sortedHand,
  activeSeats,
  firstLead,
  declarationTitle,
} from "./tablePresentation";
import { newSession, viewOf } from "./engine";
import { SUITS, type Card, type Rank } from "./types";
describe("table presentation preserves rule boundaries", () => {
  it.each([...SUITS, null])(
    "groups all 32 cards by suit with Blot strength for %s",
    (trump) => {
      const ranks: Rank[] = [
        "SEVEN",
        "EIGHT",
        "NINE",
        "TEN",
        "JACK",
        "QUEEN",
        "KING",
        "ACE",
      ];
      const hand: Card[] = [...SUITS]
        .reverse()
        .flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
      const before = structuredClone(hand);
      const sorted = sortedHand(hand, trump);
      for (let i = 0; i < SUITS.length; i++) {
        const suit = SUITS[i],
          group = sorted.slice(i * 8, i * 8 + 8);
        expect(group.every((c) => c.suit === suit)).toBe(true);
        expect(group.map((c) => c.rank)).toEqual(
          suit === trump
            ? ["JACK", "NINE", "ACE", "TEN", "KING", "QUEEN", "EIGHT", "SEVEN"]
            : ["ACE", "TEN", "KING", "QUEEN", "JACK", "NINE", "EIGHT", "SEVEN"],
        );
      }
      expect(hand).toEqual(before);
    },
  );
  it("separates the first opening from turns and permits two redouble actors", () => {
    const view = viewOf(newSession(1, "EAST").snapshot);
    expect(firstLead(view)).toBe("SOUTH");
    expect(activeSeats(view)).toEqual([view.auction.turn]);
    view.phase = "REDOUBLE";
    view.auction.pendingRedouble = ["SOUTH", "NORTH"];
    expect(activeSeats(view)).toEqual(["SOUTH", "NORTH"]);
    view.phase = "PLAYING";
    view.turn = "WEST";
    expect(activeSeats(view)).toEqual(["WEST"]);
    expect(firstLead(view)).toBe("SOUTH");
    view.phase = "MATCH_FINISHED";
    expect(activeSeats(view)).toEqual([]);
  });
  it("names declarations from public summaries without needing hidden cards", () => {
    const summary = {
      owner: "WEST" as const,
      kind: "RUN" as const,
      points: 20,
      highRank: "TEN" as const,
      trumpRun: false,
    };
    expect(declarationTitle(summary)).toBe("Терц");
    expect(declarationTitle({ ...summary, points: 50 })).toBe("50");
    expect(declarationTitle({ ...summary, points: 100 })).toBe("100");
    expect(
      declarationTitle({ ...summary, kind: "FOUR", highRank: "JACK" }),
    ).toBe("4 валета");
  });
});
