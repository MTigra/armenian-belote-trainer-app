import { test, expect, type Page } from "@playwright/test";
import {
  startGame,
  applyAction,
  automaticAction,
  playerView,
} from "../../game-core/build/dist/js/productionLibrary/armenian-belote-trainer-game-core.mjs";
test.use({ hasTouch: true });

const auto = (s: string) =>
  applyAction(
    s,
    automaticAction(
      s,
      JSON.parse(s).phase === "BIDDING"
        ? JSON.parse(s).auction.turn
        : JSON.parse(s).turn,
    ),
  );
function playing(seed: number) {
  let s = startGame(seed, "EAST");
  s = applyAction(
    s,
    JSON.stringify({ type: "bid", seat: "SOUTH", amount: 8, trump: "HEARTS" }),
  );
  for (let i = 0; i < 4; i++) s = auto(s);
  return s;
}
async function install(page: Page, snapshot: string, delay = "100000") {
  await page.goto("./");
  await page.evaluate(
    async ({ snapshot, delay }) => {
      localStorage.setItem("blot.botDelay", delay);
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("blot-local", 1);
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("active", "readwrite");
        tx.objectStore("active").put(
          {
            id: "table-ui",
            snapshot,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            chat: [],
          },
          "session",
        );
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { snapshot, delay },
  );
  await page.goto("./#game");
  await page.reload();
  await expect(page.locator(".blot-board")).toBeVisible();
}
test("the real bidding table fits short phones, stays centered on rotation and preserves draft sorting", async ({
  page,
}) => {
  await install(page, startGame(42, "EAST"));
  await expect(
    page.getByRole("button", { name: "Заявить 8 ♥", exact: true }),
  ).toBeEnabled();
  for (const [width, height] of [
    [320, 568],
    [320, 640],
    [390, 844],
    [412, 915],
    [568, 320],
    [844, 390],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".blot-board")).toHaveAttribute(
      "data-orientation",
      height >= width ? "portrait" : "landscape",
    );
    const geometry = await page.locator(".blot-board").evaluate((board) => {
      const b = board.getBoundingClientRect(),
        p = board.querySelector(".bid-controls")!.getBoundingClientRect();
      const cards = [...board.querySelectorAll(".blot-hand .playing-card")].map(
        (c) => c.getBoundingClientRect(),
      );
      return {
        board: { top: b.top, left: b.left, right: b.right, bottom: b.bottom },
        dx: p.x + p.width / 2 - b.x - b.width / 2,
        dy: p.y + p.height / 2 - b.y - b.height / 2,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        overflowY: document.documentElement.scrollHeight > innerHeight,
        cards: cards.map((c) => ({
          left: c.left,
          right: c.right,
          bottom: c.bottom,
        })),
        avatars: [...board.querySelectorAll(".blot-avatar")].map(
          (a) => a.getBoundingClientRect().width,
        ),
        blockedAvatars: [...board.querySelectorAll(".blot-avatar")].filter(
          (a) => {
            const r = a.getBoundingClientRect();
            return (
              r.left < p.right &&
              r.right > p.left &&
              r.top < p.bottom &&
              r.bottom > p.top
            );
          },
        ).length,
      };
    });
    expect(Math.abs(geometry.dx)).toBeLessThan(1);
    expect(Math.abs(geometry.dy)).toBeLessThan(1);
    expect(geometry.overflowX).toBe(false);
    expect(geometry.overflowY).toBe(false);
    expect(geometry.board.bottom).toBeLessThanOrEqual(height);
    for (const c of geometry.cards) {
      expect(c.left).toBeGreaterThanOrEqual(0);
      expect(c.right).toBeLessThanOrEqual(width);
      expect(c.bottom).toBeLessThanOrEqual(height);
    }
    expect(new Set(geometry.avatars).size).toBe(1);
    expect(geometry.blockedAvatars).toBe(0);
    await expect(
      page.getByLabel("Наши очки раздачи", { exact: true }),
    ).toBeVisible();
  }
  const before = await page
    .locator(".bid-hand .playing-card")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label")));
  await page.getByRole("button", { name: "трефы", exact: true }).click();
  expect(
    await page
      .locator(".bid-hand .playing-card")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label"))),
  ).toEqual(before);
  await expect(page.locator(".table-mark,.card-count")).toHaveCount(0);
});
test("announcements appear by the actor before proof, then archive, and never replay on reload", async ({
  page,
}) => {
  let initial = "";
  for (let seed = 0; seed < 100; seed++) {
    const s = playing(seed);
    if (!JSON.parse(playerView(s, "SOUTH")).options.mayDeclare) continue;
    let completed = s;
    while (JSON.parse(completed).tricks.length < 2) completed = auto(completed);
    if (
      JSON.parse(playerView(completed, "SOUTH")).shownDeclarations.some(
        (d: any) => d.owner === "SOUTH",
      )
    ) {
      initial = s;
      break;
    }
  }
  expect(initial).not.toBe("");
  await install(page, initial, "250");
  await page
    .getByRole("button", { name: "Показать объявления", exact: true })
    .click();
  const ownBubble = page.locator('.blot-seat[data-seat="SOUTH"] .blot-speech');
  await expect(ownBubble).toBeVisible();
  await expect(ownBubble.locator(".card-face")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Объявления", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".hand button:enabled")
    .first()
    .tap({ position: { x: 10, y: 16 } });
  await expect
    .poll(() => page.locator(".hand button:enabled").count())
    .toBeGreaterThan(0);
  const disabled = page.locator(".hand button:disabled");
  for (const card of await disabled.all())
    expect(
      await card.locator("img").evaluate((img) => getComputedStyle(img).filter),
    ).toBe("brightness(0.8)");
  await page
    .locator(".hand button:enabled")
    .first()
    .tap({ position: { x: 10, y: 16 } });
  await expect(ownBubble.locator(".card-face").first()).toBeVisible();
  await expect(page.getByText("Взятка за нами", { exact: true })).toHaveCount(
    0,
  );
  await expect(ownBubble).toHaveCount(0, { timeout: 6000 });
  await expect(
    page.getByRole("button", { name: "Объявления", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Объявления", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Объявления раздачи" })
      .locator(".card-face")
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".blot-speech")).toHaveCount(0);
});
