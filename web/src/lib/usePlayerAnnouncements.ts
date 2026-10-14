import { useEffect, useRef, useState } from "react";
import type { Card, PlayerView, Seat } from "./types";
import { declarationTitle } from "./tablePresentation";
export interface PlayerNotice {
  seat: Seat;
  title: string;
  cards: Card[];
  key: string;
}
/** Consume new public events only; mounting or restoring a connection never replays history. */
export function usePlayerAnnouncements(view: PlayerView, enabled: boolean) {
  const previous = useRef({
    deal: view.dealNumber,
    count: view.events.length,
    enabled,
  });
  const [notices, setNotices] = useState<PlayerNotice[]>([]);
  useEffect(() => {
    const old = previous.current;
    previous.current = {
      deal: view.dealNumber,
      count: view.events.length,
      enabled,
    };
    if (
      !enabled ||
      !old.enabled ||
      old.deal !== view.dealNumber ||
      old.count > view.events.length
    ) {
      setNotices([]);
      return;
    }
    const added = view.events
      .slice(old.count)
      .flatMap((e, i): PlayerNotice[] => {
        const d = e.declaration ?? e.announcement;
        if (!d && e.kind !== "BLOT" && e.kind !== "REBLOT") return [];
        return [
          {
            seat: d?.owner ?? e.seat ?? "SOUTH",
            title: d
              ? declarationTitle(d)
              : e.kind === "BLOT"
                ? "Блот"
                : "Реблот",
            cards: e.declaration?.cards ?? [],
            key: `${view.dealNumber}:${old.count + i}`,
          },
        ];
      });
    if (added.length)
      setNotices((current) => [
        ...current.filter((n) => !added.some((a) => a.seat === n.seat)),
        ...added,
      ]);
  }, [view, enabled]);
  useEffect(() => {
    if (!notices.length) return;
    const timer = setTimeout(() => setNotices([]), 3200);
    return () => clearTimeout(timer);
  }, [notices]);
  return notices;
}
