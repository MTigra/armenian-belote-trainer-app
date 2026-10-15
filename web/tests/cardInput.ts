import { expect, type Locator, type Page } from "@playwright/test";
/** Use a visible part of overlapping cards without bypassing browser hit-testing. */
export async function selectCard(page: Page, card: Locator, touch = false) {
  let point: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      point = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        for (let y = rect.top + 8; y < rect.bottom - 8; y += 8)
          for (let x = rect.left + 8; x < rect.right - 8; x += 8)
            if (document.elementFromPoint(x, y)?.closest("button") === element)
              return { x, y };
        return null;
      });
      return point !== null;
    })
    .toBe(true);
  const position = point as unknown as { x: number; y: number };
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
}
