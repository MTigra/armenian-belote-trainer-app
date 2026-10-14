import { describe, it, expect } from "vitest";
import {
  act,
  auto,
  archive,
  botSeat,
  dealNext,
  newSession,
  stateOf,
  viewOf,
  validateRecord,
  replayAt,
} from "./engine";
import { importMatch, exportMatch } from "./transfer";
import type { Session } from "./types";
function complete(seed = 17, legacy = false): Session {
  let s = newSession(seed, "SOUTH"),
    deals = 0;
  if (legacy)
    s.snapshot = replayAt(
      {
        profileVersion: "armenian-training-0.1",
        formatVersion: 1,
        setups: stateOf(s.snapshot).setups,
        actions: [],
      },
      0,
    );
  while (stateOf(s.snapshot).phase !== "MATCH_FINISHED") {
    let v = viewOf(s.snapshot);
    s.snapshot = act(s.snapshot, {
      type: "bid",
      seat: v.auction.turn,
      amount: 400,
      trump: deals % 2 ? null : "HEARTS",
    });
    for (let i = 0; i < 4; i++)
      s.snapshot = auto(s.snapshot, viewOf(s.snapshot).auction.turn);
    while (viewOf(s.snapshot).phase === "PLAYING")
      s.snapshot = auto(s.snapshot, viewOf(s.snapshot).turn);
    deals++;
    if (deals > 100) throw new Error("Match did not finish");
    if (viewOf(s.snapshot).phase !== "MATCH_FINISHED")
      s.snapshot = dealNext(s.snapshot, 17 + deals);
  }
  return s;
}
describe("React adapter uses real exported Kotlin engine", () => {
  it("continues and imports legacy automatic-announcement matches without changing their profile", () => {
    const saved = archive(complete(17, true));
    const imported = importMatch(exportMatch(saved));
    expect(imported.record.profileVersion).toBe("armenian-training-0.1");
    expect(
      imported.record.actions.some(
        (a) => a.type === "declare" || a.type === "decline-declarations",
      ),
    ).toBe(false);
    expect(imported.record).toEqual(saved.record);
    expect(imported.scores).toEqual(saved.scores);
  });
  it("starts with eight cards, target 301 and no fabricated score", () => {
    const s = newSession(1, "SOUTH");
    const v = viewOf(s.snapshot);
    expect(v.hand).toHaveLength(8);
    expect(v.target).toBe(301);
    expect(v.scores).toEqual({ northSouth: 0, eastWest: 0 });
    expect(v.options.minimumBid).toBeNull();
  });
  it("returns only the player projection", () => {
    const v = viewOf(newSession(1, "SOUTH").snapshot);
    expect(v).not.toHaveProperty("initialHands");
    expect(v).not.toHaveProperty("setups");
    expect(v).not.toHaveProperty("actions");
  });
  it("does not choose bot moves for the human seat", () => {
    let s = newSession(1, "SOUTH").snapshot;
    for (let i = 0; i < 3; i++) s = auto(s, viewOf(s).auction.turn);
    expect(viewOf(s).auction.turn).toBe("SOUTH");
    expect(botSeat(viewOf(s))).toBeNull();
    expect(() =>
      act(s, { type: "bid", seat: "SOUTH", amount: 7, trump: null }),
    ).toThrow();
  });
  it("a finished match exports and imports through versioned rules with equal results", () => {
    const saved = archive(complete());
    const loaded = importMatch(exportMatch(saved));
    expect(loaded.record).toEqual(saved.record);
    expect(loaded.scores).toEqual(saved.scores);
    expect(loaded.winner).toBe(saved.winner);
    expect(viewOf(replayAt(loaded.record, 0)).scores.northSouth).toBe(0);
    expect(
      viewOf(replayAt(loaded.record, loaded.record.actions.length)).scores,
    ).toEqual(saved.scores);
  });
  it("rejects unknown versions and incomplete or invalid records", () => {
    const s = newSession(2, "SOUTH");
    const st = stateOf(s.snapshot);
    expect(() =>
      validateRecord({
        formatVersion: 1,
        profileVersion: "armenian-training-0.1",
        setups: st.setups,
        actions: [],
      }),
    ).toThrow("завершённый");
    expect(() => importMatch('{"exportVersion":2}')).toThrow("формат");
    expect(() =>
      importMatch(
        '{"application":"armenian-blot","exportVersion":1,"match":{"record":{"profileVersion":"future"}}}',
      ),
    ).toThrow("Версия правил");
  });
  it("snapshot after actual play restores exactly without simulating in TypeScript", () => {
    let s = newSession(2, "SOUTH").snapshot;
    s = act(s, { type: "bid", seat: "WEST", amount: 8, trump: "HEARTS" });
    for (let i = 0; i < 4; i++) s = auto(s, viewOf(s).auction.turn);
    for (let i = 0; i < 7; i++) s = auto(s, viewOf(s).turn);
    const saved = JSON.parse(JSON.stringify({ snapshot: s }));
    expect(viewOf(saved.snapshot)).toEqual(viewOf(s));
    expect(auto(saved.snapshot, viewOf(s).turn)).toBe(auto(s, viewOf(s).turn));
  });
});
