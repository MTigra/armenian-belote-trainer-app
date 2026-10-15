import { it, expect, vi, afterEach } from "vitest";
import { newSession, viewOf } from "./engine";
import { askTrainer, isTrainerAnswer, trainerHistory } from "./trainer";
import type { TrainerAnswer, TrainerRequest } from "./trainerTypes";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const session = newSession(9, "SOUTH");
  const view = viewOf(session.snapshot);
  const request: TrainerRequest = {
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    accessCode: "1234",
    question: "Что делать?",
    source: { kind: "offline", localMatchId: session.id, actionIndex: 0, view },
    history: [],
  };
  const answer: TrainerAnswer = {
    protocolVersion: 1,
    requestId: request.requestId,
    moment: {
      matchId: session.id,
      dealNumber: 1,
      actionIndex: 0,
      revision: null,
      seat: "SOUTH",
    },
    perspective: "player",
    profileVersion: view.profileVersion,
    answerType: "rules",
    suggestion: null,
    explanation: "Объяснение",
    alternatives: [],
    assumptions: [],
    ruleRefs: [],
    validation: {
      format: "passed",
      actions: "not_applicable",
      strategy: "not_evaluated",
    },
  };
  return { request, answer, session };
}
it("sends only a public offline projection and leaves the game unchanged on failure", async () => {
  const { request, session } = fixture();
  const snapshot = session.snapshot;
  const mock = vi.fn().mockResolvedValue(
    Response.json(
      {
        code: "TRAINER_UNAVAILABLE",
        message: "Не настроен",
        retryable: false,
      },
      { status: 503 },
    ),
  );
  vi.stubGlobal("fetch", mock);
  await expect(
    askTrainer(request, new AbortController().signal),
  ).rejects.toThrow("Не настроен");
  const body = JSON.parse(mock.mock.calls[0][1].body);
  expect(body.source.view.hand).toHaveLength(8);
  expect(body.source.view).not.toHaveProperty("initialHands");
  expect(body.source.view).not.toHaveProperty("actions");
  expect(session.snapshot).toBe(snapshot);
});
it("online sends a reference and guest bearer without a client hand", async () => {
  const { request, answer } = fixture();
  request.source = {
    kind: "online",
    tableCode: "123456",
    expectedRevision: 18,
  };
  answer.moment.revision = 18;
  const mock = vi.fn().mockResolvedValue(Response.json(answer));
  vi.stubGlobal("fetch", mock);
  await expect(
    askTrainer(request, new AbortController().signal, "guest-token"),
  ).resolves.toEqual(answer);
  const call = mock.mock.calls[0][1];
  expect(call.headers.Authorization).toBe("Bearer guest-token");
  expect(JSON.parse(call.body).source).toEqual(request.source);
  expect(call.body).not.toContain('"hand"');
});
it("rejects partial replies, unknown actions, a different request or moment", async () => {
  const { request, answer } = fixture();
  for (const bad of [
    { explanation: "hello" },
    { ...answer, requestId: "other" },
    { ...answer, moment: { ...answer.moment, actionIndex: 3 } },
    { ...answer, suggestion: { type: "cheat", seat: "SOUTH" } },
    { ...answer, extra: true },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(bad)));
    await expect(
      askTrainer(request, new AbortController().signal),
    ).rejects.toThrow();
  }
  expect(isTrainerAnswer(answer)).toBe(true);
});
it("filters future, other seats, unknown legacy perspective and revealed history", () => {
  const { answer } = fixture();
  const message = {
    id: "m",
    role: "coach" as const,
    text: "Совет",
    moment: { deal: 1, action: 0 },
    trainerMoment: answer.moment,
    perspective: "player" as const,
    createdAt: 1,
  };
  const history = trainerHistory(
    [
      message,
      { ...message, id: "full", perspective: "all_hands" },
      {
        ...message,
        id: "future",
        trainerMoment: { ...answer.moment, actionIndex: 4 },
      },
      {
        ...message,
        id: "legacy",
        trainerMoment: undefined,
        perspective: undefined,
      },
    ],
    answer.moment,
    "player",
  );
  expect(history).toHaveLength(1);
  expect(history[0].text).toBe("Совет");
});
