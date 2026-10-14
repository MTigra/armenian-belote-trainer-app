import { useEffect, useRef, useState } from "react";
import type { Phase } from "./types";
const terminal = (phase?: Phase) =>
  Boolean(
    phase &&
      ["DEAL_FINISHED", "MATCH_FINISHED", "REDEAL_REQUIRED"].includes(phase),
  );
/** Let the final live trick finish collecting before covering the board with results. */
export function useResultReady(phase?: Phase, deal?: number) {
  const key = `${deal}:${phase}`;
  const previous = useRef(phase);
  const [ready, setReady] = useState(terminal(phase) ? key : "");
  useEffect(() => {
    const wasLive = previous.current === "PLAYING";
    previous.current = phase;
    if (!terminal(phase)) {
      setReady("");
      return;
    }
    if (!wasLive || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReady(key);
      return;
    }
    const timer = setTimeout(() => setReady(key), 900);
    return () => clearTimeout(timer);
  }, [phase, key]);
  return terminal(phase) && ready === key;
}
