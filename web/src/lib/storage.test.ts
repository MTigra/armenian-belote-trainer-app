import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { newSession } from "./engine";
import {
  saveActive,
  loadActive,
  clearActive,
  putMatch,
  loadMatches,
  deleteMatch,
  finishSession,
} from "./storage";
import type { SavedMatch } from "./types";
it("replaces the single active slot and reads the real engine snapshot unchanged", async () => {
  const a = newSession(1, "SOUTH"),
    b = newSession(2, "WEST");
  await saveActive(a);
  expect(await loadActive()).toEqual(a);
  await saveActive(b);
  expect(await loadActive()).toEqual(b);
  await clearActive();
  expect(await loadActive()).toBeNull();
});
it("archive and clearing active are one transaction; duplicates are not added", async () => {
  const s = newSession(5, "SOUTH");
  const m: SavedMatch = {
    id: "storage-fixture",
    createdAt: 1,
    finishedAt: 2,
    chat: [],
    record: {
      profileVersion: "armenian-training-0.1",
      formatVersion: 1,
      setups: [],
      actions: [],
    },
    scores: { northSouth: 301, eastWest: 200 },
    winner: "NORTH_SOUTH",
  };
  await saveActive(s);
  await finishSession(m);
  expect(await loadActive()).toBeNull();
  await putMatch(m);
  expect((await loadMatches()).filter((v) => v.id === m.id)).toHaveLength(1);
  await deleteMatch(m.id);
  expect((await loadMatches()).some((v) => v.id === m.id)).toBe(false);
});
