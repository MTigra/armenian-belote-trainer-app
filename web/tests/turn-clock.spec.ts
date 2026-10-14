import { test, expect } from "@playwright/test";
const api = process.env.E2E_API_URL || "http://127.0.0.1:8080";
test("server countdown follows the relative actor for four seats and survives rotation", async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const guests = [];
    for (let i = 0; i < 4; i++) {
      const response = await pages[i].request.post(`${api}/api/guests`, {
        data: { nickname: `Clock ${i}` },
      });
      expect(response.ok()).toBe(true);
      guests.push(await response.json());
    }
    const room = await (
      await pages[0].request.post(`${api}/api/tables`, {
        headers: { Authorization: `Bearer ${guests[0].token}` },
        data: { name: "Clock check", timerSeconds: 60 },
      })
    ).json();
    for (let i = 1; i < 4; i++)
      expect(
        (
          await pages[i].request.post(`${api}/api/tables/${room.code}/join`, {
            headers: { Authorization: `Bearer ${guests[i].token}` },
            data: {},
          })
        ).ok(),
      ).toBe(true);
    for (let i = 0; i < 4; i++) {
      await contexts[i].addInitScript(
        ({ guest, api, code }) => {
          localStorage.setItem("blot.serverOrigin", api);
          localStorage.setItem(
            "blot.onlineGuest",
            JSON.stringify({ ...guest, origin: api, tableCode: code }),
          );
        },
        { guest: guests[i], api, code: room.code },
      );
      await pages[i].goto(`${baseURL}#online`);
    }
    await pages[0]
      .getByRole("button", { name: "Начать партию", exact: true })
      .click();
    const state = await (
      await pages[0].request.get(`${api}/api/tables/${room.code}`, {
        headers: { Authorization: `Bearer ${guests[0].token}` },
      })
    ).json();
    const seats = ["SOUTH", "WEST", "NORTH", "EAST"];
    for (let i = 0; i < 4; i++) {
      const actor = seats[(seats.indexOf(state.view.auction.turn) - i + 4) % 4];
      await expect(
        pages[i].locator('.blot-seat[data-active="true"]'),
      ).toHaveAttribute("data-seat", actor);
      await expect(pages[i].locator(".blot-clock-count")).toBeVisible();
    }
    const active = pages[1].locator(
      '.blot-seat[data-active="true"] .blot-clock-ring',
    );
    const before = await active.evaluate((e) =>
      Number.parseFloat(getComputedStyle(e).strokeDashoffset),
    );
    const seconds = Number(
      await pages[1].locator(".blot-clock-count").textContent(),
    );
    await pages[1].waitForTimeout(1100);
    await expect
      .poll(() =>
        active.evaluate((e) =>
          Number.parseFloat(getComputedStyle(e).strokeDashoffset),
        ),
      )
      .toBeGreaterThan(before);
    await pages[1].setViewportSize({ width: 844, height: 390 });
    await expect(pages[1].locator(".blot-board")).toHaveAttribute(
      "data-orientation",
      "landscape",
    );
    const after = Number(
      await pages[1].locator(".blot-clock-count").textContent(),
    );
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(seconds);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
