import { useLayoutEffect, useRef, useState } from "react";
import { cardKey } from "./types";
import type { PlayerView, WonTrick } from "./types";
export const playKey = (
  deal: number,
  seat: string,
  card: PlayerView["hand"][number],
) => `${deal}:${seat}:${cardKey(card)}`;
/** Observe game moves, not presence/reconnect snapshots. Mounting never replays old animations. */
export function useTrickMotion(view: PlayerView, enabled = true) {
  const previous = useRef(view);
  const previouslyEnabled = useRef(enabled);
  const [fresh, setFresh] = useState<string[]>([]);
  const [collection, setCollection] = useState<WonTrick | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = view;
    const resumed = !previouslyEnabled.current;
    previouslyEnabled.current = enabled;
    if (!enabled || resumed) {
      clearTimeout(timer.current);
      setCollection(null);
      setFresh([]);
      return;
    }
    if (
      view.dealNumber !== old.dealNumber ||
      view.tricks.length < old.tricks.length
    ) {
      clearTimeout(timer.current);
      setCollection(null);
      setFresh([]);
      return;
    }
    const known = new Set(
      [...old.trick, ...old.tricks.flatMap((t) => t.plays)].map((p) =>
        playKey(old.dealNumber, p.seat, p.card),
      ),
    );
    const added = [
      ...view.trick,
      ...view.tricks.flatMap((t) => t.plays),
    ].filter((p) => !known.has(playKey(view.dealNumber, p.seat, p.card)));
    if (added.length)
      setFresh(added.map((p) => playKey(view.dealNumber, p.seat, p.card)));
    if (view.tricks.length > old.tricks.length) {
      clearTimeout(timer.current);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setCollection(reduced ? null : view.tricks.at(-1)!);
      timer.current = setTimeout(() => setCollection(null), 880);
    }
  }, [view, enabled]);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return { fresh, collection };
}
