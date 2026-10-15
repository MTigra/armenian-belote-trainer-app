import { test, expect } from "@playwright/test";
import {
  startGame,
  applyAction,
  automaticAction,
  matchRecord,
} from "../../game-core/build/dist/js/productionLibrary/armenian-belote-trainer-game-core.mjs";

test("trainer stores a validated structured reply, retries with the same id, and keeps offline bots paused", async ({
  page,
}) => {
  let attempt = 0;
  const ids: string[] = [];
  await page.route("**/api/trainer", async (route) => {
    const r = route.request().postDataJSON();
    ids.push(r.requestId);
    expect(r.source.kind).toBe("offline");
    expect(r.source.view.initialHands).toBeUndefined();
    if (attempt++ === 0) {
      await route.fulfill({
        status: 503,
        json: {
          code: "TRAINER_UNAVAILABLE",
          message: "Временная ошибка",
          retryable: true,
          requestId: r.requestId,
          retryAfterSeconds: null,
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        protocolVersion: 1,
        requestId: r.requestId,
        moment: {
          matchId: r.source.localMatchId,
          dealNumber: r.source.view.dealNumber,
          actionIndex: r.source.actionIndex,
          revision: null,
          seat: r.source.view.seat,
        },
        perspective: "player",
        profileVersion: r.source.view.profileVersion,
        answerType: "analysis",
        suggestion: null,
        explanation: "Разберём вашу руку по доступным сведениям.",
        alternatives: [],
        assumptions: ["Карты соперников неизвестны"],
        ruleRefs: [],
        validation: {
          format: "passed",
          actions: "not_applicable",
          strategy: "not_evaluated",
        },
      },
    });
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Тренировка с ботами", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Спросить тренера", exact: true })
    .click();
  await page.getByLabel("Код тренера").fill("1234");
  await page.getByLabel("Сообщение тренеру").fill("Оцени руку");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.getByRole("alert")).toContainText("Временная ошибка");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".message.coach")).toContainText(
    "Разберём вашу руку",
  );
  expect(ids[0]).toBe(ids[1]);
  await expect(page.locator(".message.user")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".message.coach")).toContainText(
    "Карты соперников неизвестны",
  );
  await expect(page.getByLabel("Код тренера")).toHaveValue("");
});

test("review sends the completed record and explicit perspective for the chosen moment", async ({
  page,
}) => {
  let snapshot = startGame(17, "SOUTH");
  snapshot = applyAction(
    snapshot,
    JSON.stringify({ type: "bid", seat: "WEST", amount: 400, trump: "HEARTS" }),
  );
  for (let i = 0; i < 4; i++)
    snapshot = applyAction(
      snapshot,
      automaticAction(snapshot, JSON.parse(snapshot).auction.turn),
    );
  while (JSON.parse(snapshot).phase === "PLAYING")
    snapshot = applyAction(
      snapshot,
      automaticAction(snapshot, JSON.parse(snapshot).turn),
    );
  const state = JSON.parse(snapshot);
  const match = {
    id: "trainer-review",
    createdAt: 1,
    finishedAt: 2,
    record: JSON.parse(matchRecord(snapshot)),
    chat: [],
    scores: state.scores,
    winner: state.winner,
  };
  const modes: string[] = [];
  await page.route("**/api/trainer", async (route) => {
    const r = route.request().postDataJSON();
    expect(r.source.kind).toBe("review");
    expect(r.source.record).toEqual(match.record);
    modes.push(r.source.perspective);
    if (r.source.perspective === "player") expect(r.history).toEqual([]);
    await route.fulfill({
      json: {
        protocolVersion: 1,
        requestId: r.requestId,
        moment: {
          matchId: match.id,
          dealNumber: r.source.dealNumber,
          actionIndex: r.source.actionIndex,
          revision: null,
          seat: r.source.seat,
        },
        perspective: r.source.perspective,
        profileVersion: match.record.profileVersion,
        answerType: "analysis",
        suggestion: null,
        explanation: "Объяснение выбранного момента",
        alternatives: [],
        assumptions: [],
        ruleRefs: [],
        validation: {
          format: "passed",
          actions: "not_applicable",
          strategy: "not_evaluated",
        },
      },
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: /Мои игры/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "match.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "armenian-blot",
        exportVersion: 1,
        match,
      }),
    ),
  });
  await expect(
    page.getByRole("button", { name: "Обсудить этот момент" }),
  ).toBeVisible();
  await page.getByLabel("Полная раскладка завершённого матча").check();
  await page.getByRole("button", { name: "Обсудить этот момент" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Разбор с раскрытыми картами",
  );
  await page.getByLabel("Код тренера").fill("1234");
  await page.getByLabel("Сообщение тренеру").fill("Объясни раскладку");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".coach-messages .message.coach")).toBeVisible();
  await page
    .getByRole("dialog", { name: "Чат с тренером" })
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  await page.getByLabel("Полная раскладка завершённого матча").uncheck();
  await page.getByRole("button", { name: "Обсудить этот момент" }).click();
  await expect(page.locator(".coach-messages .message.coach")).toHaveCount(0);
  await page.getByLabel("Сообщение тренеру").fill("Объясни с позиции игрока");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.locator(".coach-messages .message.coach")).toBeVisible();
  expect(modes).toEqual(["all_hands", "player"]);
  await page
    .getByRole("dialog", { name: "Чат с тренером" })
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.exportVersion).toBe(2);
  expect(exported.match.chat.map((m: { role: string }) => m.role)).toEqual([
    "user",
    "coach",
    "user",
    "coach",
  ]);
  expect(exported.match.chat[1].answer.perspective).toBe("all_hands");
  expect(exported.match.chat[3].answer.perspective).toBe("player");
});
