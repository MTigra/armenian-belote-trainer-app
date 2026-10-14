import { test, expect } from "@playwright/test";
import {
  startGame,
  applyAction,
  automaticAction,
  playerView,
} from "../../game-core/build/dist/js/productionLibrary/armenian-belote-trainer-game-core.mjs";

test("declining declarations preserves the hand; trick clears, images stay offline and reload never replays motion", async ({
  page,
  context,
}) => {
  // A genuine new-profile deal with SOUTH leading and a declaration in that hand.
  let snapshot = "";
  for (let seed = 0; seed < 100; seed++) {
    let state = startGame(seed, "EAST");
    state = applyAction(
      state,
      JSON.stringify({
        type: "bid",
        seat: "SOUTH",
        amount: 8,
        trump: "HEARTS",
      }),
    );
    for (let i = 0; i < 4; i++)
      state = applyAction(
        state,
        automaticAction(state, JSON.parse(state).auction.turn),
      );
    if (JSON.parse(playerView(state, "SOUTH")).options.mayDeclare) {
      snapshot = state;
      break;
    }
  }
  expect(snapshot).not.toBe("");
  await page.goto("./");
  await page.evaluate(async (state) => {
    await navigator.serviceWorker.ready;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("blot-local", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("active", "readwrite");
      tx.objectStore("active").put(
        {
          id: "motion-game",
          snapshot: state,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          chat: [],
        },
        "session",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, snapshot);
  await context.setOffline(true);
  await page.goto("./#game");
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Показать объявления?" }),
  ).toBeVisible();
  await expect(page.locator(".hand button")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Не показывать", exact: true })
    .click();
  await expect(page.locator(".hand button:enabled").first()).toBeVisible();
  await expect(page.locator(".hand button")).toHaveCount(8);
  expect(
    await page
      .locator(".hand .card-face")
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await page.evaluate(() => {
    (window as any).cardMotions = [];
    document.addEventListener("animationstart", (event) => {
      (window as any).cardMotions.push((event as AnimationEvent).animationName);
    });
  });
  await page
    .locator(".hand button:enabled")
    .first()
    .click({ position: { x: 10, y: 16 } });
  await expect(page.locator(".hand button")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Последняя взятка", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".last-trick .card-face")).toHaveCount(4);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).cardMotions.filter(
            (name: string) => name === "collect-trick",
          ).length,
      ),
    )
    .toBe(1);
  await expect(page.locator(".trick-collection")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).cardMotions.includes("card-throw"),
    ),
  ).toBe(true);
  const score = await page
    .getByLabel("Наши очки раздачи", { exact: true })
    .innerText();
  const other = await page
    .getByLabel("Очки раздачи соперников", { exact: true })
    .innerText();
  expect(Number(score) + Number(other)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Тренер", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Чат с тренером" }),
  ).toBeVisible();
  await expect(page.locator(".trick-collection, .card-throw")).toHaveCount(0);
  await expect(page.locator(".last-trick .card-face")).toHaveCount(4);
  expect(
    await page
      .locator(".card-face")
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await context.setOffline(false);
});
