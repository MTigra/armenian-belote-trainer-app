import { selectCard } from "./cardInput";
import { test, expect, type Page, type Route } from "@playwright/test";
const api = process.env.E2E_API_URL || "http://127.0.0.1:8080";
async function credentials(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("blot.onlineGuest")!),
  );
}
async function snapshot(page: Page) {
  const guest = await credentials(page);
  return page.request
    .get(`${api}/api/tables/${guest.tableCode}`, {
      headers: { Authorization: `Bearer ${guest.token}` },
    })
    .then((response) => response.json());
}
async function play(page: Page) {
  await expect
    .poll(async () => {
      const choice = page.getByRole("button", {
        name: "Показать объявления",
        exact: true,
      });
      if (await choice.isVisible()) await choice.click();
      return page.locator(".hand button:enabled").count();
    })
    .toBeGreaterThan(0);
  await selectCard(page, page.locator(".hand button:enabled").first());
}
test("four guests play online, resume their own seat, keep coach independent and save private local records", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(process.env.E2E_BASE_URL ? 300000 : 120000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  await contexts[3].addInitScript(() => {
    const NativeSocket = window.WebSocket;
    (window as any).testSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).testSockets.push(this);
      }
    };
  });
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    if (process.env.E2E_USE_DEFAULT_API === "1")
      await pages[0].addInitScript(() =>
        localStorage.setItem("blot.serverOrigin", location.origin),
      );
    for (const page of pages) {
      if (process.env.E2E_USE_DEFAULT_API !== "1")
        await page.addInitScript(
          (origin) => localStorage.setItem("blot.serverOrigin", origin),
          api,
        );
      await page.goto(baseURL!);
    }
    // Keep a genuine unfinished offline game beside the online match.
    await pages[0]
      .getByRole("button", { name: "Тренировка с ботами", exact: true })
      .click();
    await pages[0]
      .getByRole("button", { name: "Заявить 8 ♥", exact: true })
      .waitFor();
    await pages[0].getByRole("button", { name: "Меню партии" }).click();
    await pages[0]
      .getByRole("button", { name: "Сохранить и выйти в меню" })
      .click();
    const offline = await pages[0].evaluate(
      async () =>
        new Promise<string>((resolve, reject) => {
          const open = indexedDB.open("blot-local");
          open.onsuccess = () => {
            const read = open.result
              .transaction("active")
              .objectStore("active")
              .get("session");
            read.onsuccess = () => resolve(read.result.snapshot);
            read.onerror = () => reject(read.error);
          };
        }),
    );
    await pages[0]
      .getByRole("button", { name: "Играть с людьми", exact: true })
      .click();
    await pages[0]
      .getByRole("button", { name: "Создать", exact: true })
      .click();
    await pages[0].getByLabel("Имя за столом").fill("Тигран");
    await pages[0]
      .getByLabel("Название стола")
      .fill("Проверка четырёх игроков");
    await pages[0].getByLabel("Таймер хода").selectOption("none");
    await pages[0]
      .getByRole("button", { name: "Создать стол", exact: true })
      .click();
    await expect(pages[0].locator(".room-code strong")).toBeVisible();
    const code = (
      await pages[0].locator(".room-code strong").innerText()
    ).trim();
    for (const page of pages.slice(1)) {
      await page
        .getByRole("button", { name: "Играть с людьми", exact: true })
        .click();
      await page
        .getByLabel("Имя за столом")
        .fill(["", "Нарек", "Давид", "Мариам"][pages.indexOf(page)]);
      await page.getByLabel("Код стола", { exact: true }).fill(code);
      await page
        .getByRole("button", { name: "Подключиться", exact: true })
        .click();
      await expect(page.locator(".room-code strong")).toHaveText(code);
    }
    await expect(
      pages[0].getByRole("button", { name: "Начать партию" }),
    ).toBeEnabled();
    // Editing a saved guest must keep identity, occupied seat and all four clients.
    const originalGuest = await credentials(pages[0]);
    await pages[0]
      .getByRole("button", { name: "В главное меню", exact: true })
      .click();
    await pages[0]
      .getByRole("button", { name: "Играть с людьми", exact: true })
      .click();
    await pages[0].getByLabel("Имя за столом").fill("Тигран Блот");
    await pages[0]
      .getByRole("button", { name: "Сохранить имя", exact: true })
      .click();
    await expect
      .poll(async () => (await credentials(pages[0])).nickname)
      .toBe("Тигран Блот");
    expect((await credentials(pages[0])).token).toBe(originalGuest.token);
    await pages[0]
      .getByRole("button", { name: "Вернуться за стол", exact: true })
      .click();
    await expect(
      pages[1].getByText("Тигран Блот", { exact: true }),
    ).toBeVisible();
    await pages[0].getByRole("button", { name: "Начать партию" }).click();
    for (const page of pages)
      await expect(page.locator(".bid-hand .playing-card")).toHaveCount(8);
    const views = await Promise.all(pages.map(snapshot));
    expect(views[0].members.map((member: any) => member.nickname)).toEqual([
      "Тигран Блот",
      "Нарек",
      "Давид",
      "Мариам",
    ]);
    expect(views.map((value) => value.selfSeat)).toEqual([
      "SOUTH",
      "WEST",
      "NORTH",
      "EAST",
    ]);
    expect(
      new Set(
        views.flatMap((value) =>
          value.view.hand.map((card: any) => `${card.suit}-${card.rank}`),
        ),
      ).size,
    ).toBe(32);
    for (const value of views) {
      expect(value.view).not.toHaveProperty("initialHands");
      expect(value.view).not.toHaveProperty("hands");
    }
    // One server deadline is shown at the actor's relative seat in every guest's view.
    const seats = ["SOUTH", "WEST", "NORTH", "EAST"];
    for (let index = 0; index < pages.length; index++) {
      const value = views[index];
      const relative =
        seats[
          (seats.indexOf(value.view.auction.turn) -
            seats.indexOf(value.selfSeat) +
            4) %
            4
        ];
      await expect(
        pages[index].locator('.blot-seat[data-active="true"]'),
      ).toHaveAttribute("data-seat", relative);
      if (value.timerSeconds === null) {
        await expect(pages[index].locator(".blot-clock-count")).toHaveCount(0);
      } else {
        const seconds = Number(
          await pages[index]
            .locator(".blot-clock-count")
            .textContent({ timeout: 12000 }),
        );
        expect(seconds).toBeGreaterThan(0);
        expect(seconds).toBeLessThanOrEqual(value.timerSeconds);
      }
      await expect(
        pages[index].getByLabel("Наши очки раздачи", { exact: true }),
      ).toBeVisible();
    }
    await pages[1].getByLabel("Количество очков заявки").fill("400");
    await pages[1]
      .getByRole("button", { name: "Заявить 400 ♥", exact: true })
      .click();
    for (const index of [2, 3, 0, 1]) {
      await expect(
        pages[index].getByRole("button", { name: "Пас", exact: true }),
      ).toBeEnabled();
      await pages[index]
        .getByRole("button", { name: "Пас", exact: true })
        .click();
    }
    await expect(pages[0].locator("#board")).toBeVisible();
    // Reload a guest during a real match. Other seats remain occupied.
    const identity = await credentials(pages[3]);
    await pages[3].close();
    pages[3] = await contexts[3].newPage();
    await pages[3].goto(`${baseURL}#online`);
    await expect(pages[3].locator(".hand button")).toHaveCount(8);
    expect((await credentials(pages[3])).id).toBe(identity.id);
    expect((await snapshot(pages[3])).selfSeat).toBe("EAST");
    let delayedTrainer: Route | undefined;
    await pages[2].route("**/api/trainer", (route) => {
      delayedTrainer = route;
    });
    await pages[2].getByRole("button", { name: "Тренер", exact: true }).click();
    await expect(pages[2].locator(".coach-context")).toContainText(
      "партия продолжается",
    );
    await pages[2].getByLabel("Код тренера").fill("1234");
    await pages[2].getByLabel("Сообщение тренеру").fill("Объясни этот момент");
    await pages[2].getByRole("button", { name: "Отправить сообщение" }).click();
    await expect(
      pages[2].locator('.coach-messages [role="status"]'),
    ).toContainText("Ожидаем ответ");
    const trainerMoment = await snapshot(pages[2]);
    await contexts[3].setOffline(true);
    await pages[3].evaluate(() =>
      (window as any).testSockets.forEach((socket: WebSocket) =>
        socket.close(),
      ),
    );
    await expect(pages[3].locator(".online-status")).toContainText("связь");
    await play(pages[1]);
    await contexts[3].setOffline(false);
    await expect(
      pages[3].locator(".trick > .trick-cards .trick-play"),
    ).toHaveCount(1);
    await expect(
      pages[3].locator(".card-throw, .trick-collection"),
    ).toHaveCount(0);
    await expect(pages[2].locator(".message.user small")).toContainText(
      "прошлый момент",
    );
    expect(delayedTrainer).toBeTruthy();
    const trainerRequest = delayedTrainer!.request().postDataJSON();
    expect(trainerRequest.source).toEqual({
      kind: "online",
      tableCode: trainerMoment.code,
      expectedRevision: trainerMoment.revision,
    });
    expect(trainerRequest.source.view).toBeUndefined();
    await delayedTrainer!.fulfill({
      json: {
        protocolVersion: 1,
        requestId: trainerRequest.requestId,
        moment: {
          matchId: trainerMoment.id,
          dealNumber: trainerMoment.view.dealNumber,
          actionIndex: trainerMoment.actionCount,
          revision: trainerMoment.revision,
          seat: trainerMoment.selfSeat,
        },
        perspective: "player",
        profileVersion: trainerMoment.view.profileVersion,
        answerType: "analysis",
        suggestion: null,
        explanation: "Совет относится к исходному моменту.",
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
    await expect(pages[2].locator(".message.coach")).toContainText(
      "Совет относится к исходному моменту",
    );
    await expect(pages[2].locator(".message.coach small")).toContainText(
      "прошлый момент",
    );
    await pages[2]
      .getByRole("dialog", { name: "Чат с тренером" })
      .getByRole("button", { name: "Закрыть", exact: true })
      .click();
    const limit = Date.now() + 60000;
    while (
      !(await pages[0]
        .getByRole("dialog", { name: "Результат онлайн-раздачи" })
        .isVisible())
    ) {
      if (Date.now() > limit) throw new Error("Online match did not finish");
      let moved = false;
      for (const page of pages) {
        if (
          (await page.locator(".hand button:enabled").count()) ||
          (await page
            .getByRole("button", { name: "Показать объявления", exact: true })
            .isVisible())
        ) {
          await play(page);
          moved = true;
          break;
        }
      }
      if (!moved) await pages[0].waitForTimeout(60);
    }
    for (const page of pages) {
      await expect(
        page.getByRole("dialog", { name: "Результат онлайн-раздачи" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "В главное меню", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "В главное меню", exact: true })
        .click();
      await page.getByRole("button", { name: "Мои игры", exact: true }).click();
      await expect(page.locator(".match-row")).toHaveCount(1);
    }
    const records = await Promise.all(
      pages.map((page) =>
        page.evaluate(
          async () =>
            new Promise<any[]>((resolve, reject) => {
              const open = indexedDB.open("blot-local");
              open.onsuccess = () => {
                const read = open.result
                  .transaction("matches")
                  .objectStore("matches")
                  .getAll();
                read.onsuccess = () => resolve(read.result);
                read.onerror = () => reject(read.error);
              };
            }),
        ),
      ),
    );
    expect(records.map((list) => list[0].seat)).toEqual([
      "SOUTH",
      "WEST",
      "NORTH",
      "EAST",
    ]);
    expect(records[0][0].record).toEqual(records[3][0].record);
    expect(records[2][0].chat).toHaveLength(2);
    expect(records[2][0].chat[1].answer.moment.revision).toBe(
      trainerMoment.revision,
    );
    expect(records[0][0].chat).toHaveLength(0);
    const active = await pages[0].evaluate(
      async () =>
        new Promise<string>((resolve) => {
          const open = indexedDB.open("blot-local");
          open.onsuccess = () => {
            const read = open.result
              .transaction("active")
              .objectStore("active")
              .get("session");
            read.onsuccess = () => resolve(read.result.snapshot);
          };
        }),
    );
    expect(active).toBe(offline);
    await pages[1].locator(".match-row").click();
    await pages[1].getByLabel("Полная раскладка завершённого матча").check();
    await expect(pages[1].locator(".review-hands .playing-card")).toHaveCount(
      32,
    );
    const gone = await pages[0].request.get(`${api}/api/tables/${code}`, {
      headers: {
        Authorization: `Bearer ${(await credentials(pages[0])).token}`,
      },
    });
    expect(gone.status()).toBe(404);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
