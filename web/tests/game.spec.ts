import { test, expect, type Page } from "@playwright/test";
async function active(page: Page) {
  return page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("blot-local", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return await new Promise<any>((resolve, reject) => {
      const r = d.transaction("active").objectStore("active").get("session");
      r.onsuccess = () => {
        d.close();
        resolve(r.result ?? null);
      };
      r.onerror = () => reject(r.error);
    });
  });
}
async function start(page: Page) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Тренировка с ботами", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Заявить 8 ♥", exact: true }),
  ).toBeEnabled();
}
async function closeAuction(page: Page, amount = 8) {
  await page.getByLabel("Количество очков заявки").fill(String(amount));
  await page
    .getByRole("button", { name: `Заявить ${amount} ♥`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пас", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Пас", exact: true }).click();
  await expect(page.locator("#board")).toBeVisible();
}

test("real auction, legal hand, pause for coach, AI failure and exact reload continuation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  expect(await page.locator(".bid-hand .playing-card").count()).toBe(8);
  await closeAuction(page);
  await page.getByRole("button", { name: "Тренер", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Чат с тренером" }),
  ).toBeVisible();
  await expect.poll(async () => Boolean(await active(page))).toBe(true);
  const before = await active(page);
  const count = JSON.parse(before.snapshot).actions.length;
  await page.waitForTimeout(1600);
  expect(JSON.parse((await active(page)).snapshot).actions.length).toBe(count);
  await page.getByLabel("Код тренера").fill("1234");
  await page.getByLabel("Сообщение тренеру").fill("Объясни текущую руку");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.getByRole("alert")).toContainText("пока не подключён");
  expect(JSON.parse((await active(page)).snapshot).actions.length).toBe(count);
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Чат с тренером" }),
  ).toBeVisible();
  expect(JSON.parse((await active(page)).snapshot).actions.length).toBe(count);
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Чат с тренером" }),
  ).not.toBeVisible();
  await expect
    .poll(async () => page.locator(".hand button:enabled").count())
    .toBeGreaterThan(0);
  expect(await page.locator(".hand button").count()).toBeGreaterThan(0);
  await page.locator(".hand button:enabled").first().click();
  await page.getByRole("button", { name: "Сыграть карту" }).click();
  await page.getByRole("button", { name: "Меню партии" }).click();
  await page.getByRole("button", { name: "Сохранить и выйти в меню" }).click();
  await expect(
    page.getByRole("button", { name: "Продолжить партию" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Новая тренировка" }).click();
  await expect(
    page.getByRole("dialog", { name: "Новая тренировка" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Мои игры", exact: true }).click();
  await expect(page.getByText("Завершённых матчей пока нет.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("complete a genuine match, save history, export, import and replay", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Меню партии" }).click();
  await page.getByLabel("Темп ботов").selectOption("250");
  await page.getByRole("button", { name: "Вернуться к столу" }).click();
  // A legal high bid guarantees failure after this deal and reaches 301 without forging any score.
  await closeAuction(page, 400);
  const limit = Date.now() + 45000;
  while (
    !(await page.getByRole("dialog", { name: "Результат раздачи" }).isVisible())
  ) {
    if (Date.now() > limit) throw new Error("Match did not finish");
    const playable = page.locator(".hand button:enabled");
    if (await playable.count()) {
      await playable.first().click();
      await page.getByRole("button", { name: "Сыграть карту" }).click();
    } else await page.waitForTimeout(200);
  }
  await expect(page.getByText("Победили соперники")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "В главное меню", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "В главное меню", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Продолжить партию", exact: true }),
  ).not.toBeVisible();
  expect(await active(page)).toBeNull();
  await page.getByRole("button", { name: "Мои игры", exact: true }).click();
  await expect(page.locator(".match-row")).toHaveCount(1);
  await page.locator(".match-row").click();
  await page.getByRole("button", { name: "Следующее действие" }).click();
  await expect(page.getByText(/Действие 1 из/)).toBeVisible();
  await page.getByLabel("Полная раскладка завершённого матча").check();
  await expect(page.locator(".review-hands .playing-card")).toHaveCount(32);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const file = await downloaded;
  const path = await file.path();
  if (!path) throw new Error("No export file");
  await page.getByRole("button", { name: "Все игры" }).click();
  await page.getByLabel("Импортировать матч").setInputFiles(path);
  await expect(page.getByText("Разбор матча", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Все игры" }).click();
  await expect(page.locator(".match-row")).toHaveCount(1);
  await page.getByLabel("Импортировать матч").setInputFiles({
    name: "unknown.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"application":"armenian-blot","exportVersion":2}'),
  });
  await expect(page.getByRole("alert")).toContainText("Неизвестный формат");
  await page.reload();
  await expect(page.locator(".match-row")).toHaveCount(1);
});

test("production app starts offline after caching and keeps a local active game", async ({
  page,
  context,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Спросить тренера" }).click();
  await expect.poll(async () => Boolean(await active(page))).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const before = await active(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".bid-table")).toBeVisible();
  expect(JSON.parse((await active(page)).snapshot).actions.length).toBe(
    JSON.parse(before.snapshot).actions.length,
  );
  await context.setOffline(false);
});
