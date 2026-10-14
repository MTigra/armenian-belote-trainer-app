import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import { act, auto, newSession, viewOf } from "./engine";
import Announcements from "../components/Announcements";
it("renders only public summaries before showing and only disclosed cards afterwards", () => {
  let snapshot = "";
  for (let seed = 0; seed < 100; seed++) {
    let s = newSession(seed, "SOUTH").snapshot;
    s = act(s, { type: "bid", seat: "WEST", amount: 8, trump: "HEARTS" });
    for (let i = 0; i < 4; i++) s = auto(s, viewOf(s).auction.turn);
    while (viewOf(s).tricks.length < 1) s = auto(s, viewOf(s).turn);
    if (viewOf(s).events.some((e) => e.announcement)) {
      snapshot = s;
      break;
    }
  }
  expect(snapshot).not.toBe("");
  const before = viewOf(snapshot);
  expect(before.events.some((e) => e.announcement)).toBe(true);
  expect(before.events.some((e) => e.declaration)).toBe(false);
  const beforeHTML = renderToStaticMarkup(
    createElement(Announcements, { view: before, onClose: () => {} }),
  );
  expect(beforeHTML).not.toContain('class="playing-card');
  for (let i = 0; i < 4; i++) snapshot = auto(snapshot, viewOf(snapshot).turn);
  const after = viewOf(snapshot),
    shown = after.events.flatMap((e) => (e.declaration ? [e.declaration] : []));
  const afterHTML = renderToStaticMarkup(
    createElement(Announcements, { view: after, onClose: () => {} }),
  );
  expect(shown.length).toBeGreaterThan(0);
  expect((afterHTML.match(/class="playing-card/g) ?? []).length).toBe(
    shown.reduce((n, d) => n + d.cards.length, 0),
  );
});
