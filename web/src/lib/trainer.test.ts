import { it, expect, vi, afterEach } from "vitest";
import { newSession, viewOf } from "./engine";
import { askTrainer } from "./trainer";
afterEach(() => vi.unstubAllGlobals());
it("sends only a public projection and surfaces unavailable AI without touching the game", async () => {
  const session = newSession(9, "SOUTH"),
    snapshot = session.snapshot;
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("", { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    askTrainer(
      viewOf(snapshot),
      "Что делать?",
      "1234",
      new AbortController().signal,
    ),
  ).rejects.toThrow("пока не подключён");
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.context.hand).toHaveLength(8);
  expect(payload.context).not.toHaveProperty("initialHands");
  expect(payload.context).not.toHaveProperty("actions");
  expect(session.snapshot).toBe(snapshot);
});
