import { selectCard } from "./cardInput";
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
  if (
    await page.getByRole("dialog", { name: "Показать объявления?" }).isVisible()
  )
    await page
      .getByRole("dialog", { name: "Показать объявления?" })
      .getByRole("button", { name: "Спросить тренера", exact: true })
      .click();
  else await page.getByRole("button", { name: "Тренер", exact: true }).click();
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
    .poll(async () => {
      if (
        await page
          .getByRole("button", { name: "Показать объявления", exact: true })
          .isVisible()
      )
        await page
          .getByRole("button", { name: "Показать объявления", exact: true })
          .click();
      return page.locator(".hand button:enabled").count();
    })
    .toBeGreaterThan(0);
  expect(await page.locator(".hand button").count()).toBeGreaterThan(0);
  await selectCard(page, page.locator(".hand button:enabled").first());
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
    if (
      await page
        .getByRole("button", { name: "Показать объявления", exact: true })
        .isVisible()
    ) {
      await page
        .getByRole("button", { name: "Показать объявления", exact: true })
        .click();
    } else if (await playable.count()) {
      await selectCard(page, playable.first());
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

async function checkFan(page: Page, selector: string, count: number) {
  const hand = page.locator(selector);
  await expect(hand.locator(".playing-card")).toHaveCount(count);
  const metrics = await hand.evaluate((element) => {
    const board = element
      .closest(".game-board, .bid-table")!
      .getBoundingClientRect();
    const cards = [...element.querySelectorAll(".playing-card")].map((card) => {
      const rect = card.getBoundingClientRect();
      const face = card.querySelector<HTMLImageElement>(".card-face")!;
      const index = face.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        imageLoaded: face.complete && face.naturalWidth > 0,
        opaque: getComputedStyle(card).opacity,
        source: face.src,
        indexTop: index.top,
      };
    });
    return {
      board: { left: board.left, right: board.right, bottom: board.bottom },
      cards,
      overflow: getComputedStyle(element).overflowX,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(metrics.overflow).toBe("visible");
  expect(metrics.pageOverflow).toBe(false);
  expect(
    Math.max(...metrics.cards.map((c) => c.top)) -
      Math.min(...metrics.cards.map((c) => c.top)),
  ).toBeLessThan(16);
  for (const card of metrics.cards) {
    expect(card.left).toBeGreaterThanOrEqual(metrics.board.left);
    expect(card.right).toBeLessThanOrEqual(metrics.board.right);
    expect(card.bottom).toBeLessThanOrEqual(metrics.board.bottom);
    expect(card.imageLoaded).toBe(true);
    expect(card.opaque).toBe("1");
    expect(card.source).toContain("/cards/");
  }
}

async function checkTrickSeats(page: Page) {
  const positions = await page
    .getByRole("dialog", { name: "Последняя взятка" })
    .locator(".trick-cards")
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLElement>(".trick-play")].map(
        (card) => {
          const rect = card.getBoundingClientRect();
          const matrix = new DOMMatrixReadOnly(
            getComputedStyle(card).transform,
          );
          return {
            seat: card.dataset.seat,
            x: rect.left + rect.width / 2 - (bounds.left + bounds.width / 2),
            y: rect.top + rect.height / 2 - (bounds.top + bounds.height / 2),
            angle: Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
          };
        },
      );
    });
  expect(positions).toHaveLength(4);
  const seats = Object.fromEntries(positions.map((p) => [p.seat, p]));
  expect(seats.SOUTH.y).toBeGreaterThan(0);
  expect(seats.NORTH.y).toBeLessThan(0);
  expect(seats.WEST.x).toBeLessThan(0);
  expect(seats.EAST.x).toBeGreaterThan(0);
  expect(seats.SOUTH.angle).toBe(0);
  expect(Math.abs(seats.NORTH.angle)).toBe(180);
  expect(seats.WEST.angle).toBe(90);
  expect(seats.EAST.angle).toBe(-90);
}

test.describe("touch table", () => {
  test.use({ hasTouch: true });
  test("single-row mobile hand, one-tap play and seat-facing trick survive rotation", async ({
    page,
  }) => {
    await start(page);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await checkFan(page, ".bid-hand", 8);
    }
    await closeAuction(page);
    await expect
      .poll(async () => {
        if (
          await page
            .getByRole("button", { name: "Показать объявления", exact: true })
            .isVisible()
        )
          await page
            .getByRole("button", { name: "Показать объявления", exact: true })
            .click();
        return page.locator(".hand button:enabled").count();
      })
      .toBeGreaterThan(0);
    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [430, 932],
      [844, 390],
      [568, 320],
    ]) {
      await page.setViewportSize({ width, height });
      await checkFan(page, ".hand", 8);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#board")).toHaveAttribute(
      "data-orientation",
      "portrait",
    );
    const label = await page
      .locator(".hand button:enabled")
      .first()
      .getAttribute("aria-label");
    const card = page
      .locator(".hand")
      .getByRole("button", { name: label!, exact: true });
    await selectCard(page, card, true);
    await expect(page.locator(".hand button")).toHaveCount(7);
    await expect(
      page.getByRole("button", { name: "Сыграть карту" }),
    ).toHaveCount(0);
    // The centre can already be collecting the completed trick; the selected
    // card must disappear from the hand regardless of that animation phase.
    await expect(
      page.locator(".hand").getByRole("button", { name: label!, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Последняя взятка", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".trick-collection")).toHaveCount(0);
    await page.getByRole("button", { name: "Меню партии" }).click();
    await page.getByRole("button", { name: "Вернуться к столу" }).click();
    await page
      .getByRole("button", { name: "Последняя взятка", exact: true })
      .click();
    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [844, 390],
      [568, 320],
      [1440, 980],
      [1024, 768],
      [540, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await checkTrickSeats(page);
      await checkFan(page, ".hand", 7);
    }
  });
});
