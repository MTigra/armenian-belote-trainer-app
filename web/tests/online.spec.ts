import { test, expect, type Page } from "@playwright/test";
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
    .poll(() => page.locator(".hand button:enabled").count())
    .toBeGreaterThan(0);
  await page
    .locator(".hand button:enabled")
    .first()
    .click({ position: { x: 10, y: 16 } });
}
test("four guests play online, resume their own seat, keep coach independent and save private local records", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    for (const page of pages) {
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
      await page.getByLabel("Код стола", { exact: true }).fill(code);
      await page
        .getByRole("button", { name: "Подключиться", exact: true })
        .click();
      await expect(page.locator(".room-code strong")).toHaveText(code);
    }
    await expect(
      pages[0].getByRole("button", { name: "Начать партию" }),
    ).toBeEnabled();
    await pages[0].getByRole("button", { name: "Начать партию" }).click();
    for (const page of pages)
      await expect(page.locator(".bid-hand .playing-card")).toHaveCount(8);
    const views = await Promise.all(pages.map(snapshot));
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
    await pages[2].getByRole("button", { name: "Тренер", exact: true }).click();
    await expect(pages[2].locator(".coach-context")).toContainText(
      "партия продолжается",
    );
    await pages[2].getByLabel("Код тренера").fill("1234");
    await pages[2].getByLabel("Сообщение тренеру").fill("Объясни этот момент");
    await pages[2].getByRole("button", { name: "Отправить сообщение" }).click();
    await expect(pages[2].getByRole("alert")).toContainText(
      "пока не подключён",
    );
    await play(pages[1]);
    await expect(pages[2].locator(".message.user small")).toContainText(
      "прошлый момент",
    );
    await pages[2]
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
        if (await page.locator(".hand button:enabled").count()) {
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
    expect(records[2][0].chat).toHaveLength(1);
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
