import { test, expect } from "@playwright/test";
const api = process.env.E2E_API_URL || "http://127.0.0.1:8080";

test("leaving a sleeping server connection keeps offline training independent", async ({
  page,
}) => {
  await page.addInitScript(
    (origin) => localStorage.setItem("blot.serverOrigin", origin),
    api,
  );
  let mutations = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(api) && request.method() === "POST")
      mutations++;
  });
  await page.route(`${api}/api/health`, (route) =>
    route.fulfill({
      status: 503,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Starting",
    }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Играть с людьми", exact: true })
    .click();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await page.getByRole("button", { name: "Создать стол", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("около минуты");
  await page
    .getByRole("button", { name: "Тренировка с ботами", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Заявить 8 ♥", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(
    page.getByRole("button", { name: "Заявить 8 ♥", exact: true }),
  ).toBeVisible();
  expect(mutations).toBe(0);
});

test("a cold server and expired guest recover on the first create attempt", async ({
  page,
}) => {
  await page.addInitScript((origin) => {
    localStorage.setItem("blot.serverOrigin", origin);
    localStorage.setItem(
      "blot.onlineGuest",
      JSON.stringify({
        origin,
        id: "old-guest",
        nickname: "Старый гость",
        token: "expired-token",
        tableCode: null,
      }),
    );
  }, api);
  let me = 0,
    health = 0,
    guests = 0,
    tables = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url() === `${api}/api/guests`) guests++;
    if (request.url() === `${api}/api/tables`) tables++;
  });
  await page.route(`${api}/api/me`, async (route) => {
    if (++me === 1)
      await route.fulfill({
        status: 503,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { code: "STARTING", message: "Starting" },
      });
    else await route.continue();
  });
  await page.route(`${api}/api/health`, async (route) => {
    if (++health === 1)
      await route.fulfill({
        status: 503,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Starting",
      });
    else await route.continue();
  });
  await page.goto("./");
  await expect.poll(() => me).toBe(1);
  await page
    .getByRole("button", { name: "Играть с людьми", exact: true })
    .click();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await page.getByRole("button", { name: "Создать стол", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("около минуты");
  await expect(page.locator(".room-code strong")).toBeVisible();
  expect(guests).toBe(1);
  expect(tables).toBe(1);
  const guest = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("blot.onlineGuest")!),
  );
  expect(guest.token).not.toBe("expired-token");
  await page
    .getByRole("button", { name: "Покинуть стол", exact: true })
    .click();
});
