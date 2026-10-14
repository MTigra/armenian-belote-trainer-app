import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, ChatMessage, SavedMatch, Session } from "./types";
import {
  act,
  archive,
  auto,
  botSeat,
  dealNext,
  newSession,
  stateOf,
  viewOf,
} from "./engine";
import * as storage from "./storage";
export function useOfflineGame(running: boolean, paused: boolean) {
  const [session, setSession] = useState<Session | null>(null),
    [matches, setMatches] = useState<SavedMatch[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve());
  const writes = useRef(0);
  const snapshot = session?.snapshot ?? null;
  const view = useMemo(() => (snapshot ? viewOf(snapshot) : null), [snapshot]);
  const state = useMemo(
    () => (snapshot ? stateOf(snapshot) : null),
    [snapshot],
  );
  const [speed, setSpeed] = useState(
    () => Number(storage.preference("botDelay", "650")) || 650,
  );
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([storage.loadActive(), storage.loadMatches()]).then(
      ([active, history]) => {
        if (cancelled) return;
        if (active.status === "fulfilled") setSession(active.value);
        else
          setError(
            "Не удалось прочитать сохранение. Проверьте доступ к локальному хранилищу.",
          );
        if (history.status === "fulfilled") setMatches(history.value);
        else
          setError(
            "История недоступна: браузер не разрешил локальное хранение.",
          );
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready || !session) return;
    const saved = session;
    writes.current++;
    setSaving(true);
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (stateOf(saved.snapshot).phase === "MATCH_FINISHED") {
          const match = archive(saved);
          await storage.finishSession(match);
          setMatches((prev) =>
            [match, ...prev.filter((m) => m.id !== match.id)].sort(
              (a, b) => b.finishedAt - a.finishedAt,
            ),
          );
        } else await storage.saveActive(saved);
      })
      .catch(() =>
        setError(
          "Не удалось сохранить партию на устройстве. Не закрывайте приложение до восстановления хранилища.",
        ),
      )
      .finally(() => {
        writes.current--;
        if (writes.current === 0) setSaving(false);
      });
  }, [session, ready]);
  useEffect(() => {
    if (!running || paused || !ready || !view || !snapshot) return;
    const seat = botSeat(view);
    if (!seat) return;
    const expected = snapshot;
    const delay =
      view.phase === "PLAYING" &&
      view.trick.length === 0 &&
      view.tricks.length > 0
        ? Math.max(1000, speed)
        : speed;
    const timer = setTimeout(
      () =>
        setSession((cur) => {
          if (!cur || cur.snapshot !== expected) return cur;
          try {
            return {
              ...cur,
              snapshot: auto(cur.snapshot, seat),
              updatedAt: Date.now(),
            };
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Бот не смог выполнить действие",
            );
            return cur;
          }
        }),
      delay,
    );
    return () => clearTimeout(timer);
  }, [running, paused, ready, view, snapshot, speed]);
  function action(a: Action) {
    setSession((cur) => {
      if (!cur) return cur;
      try {
        return {
          ...cur,
          snapshot: act(cur.snapshot, a),
          updatedAt: Date.now(),
        };
      } catch {
        setError("Действие больше недоступно. Проверьте текущую очередь.");
        return cur;
      }
    });
  }
  function start() {
    setError("");
    setSession(newSession());
  }
  function next() {
    setSession((cur) => {
      if (!cur) return cur;
      try {
        return {
          ...cur,
          snapshot: dealNext(cur.snapshot),
          updatedAt: Date.now(),
        };
      } catch {
        setError("Сейчас нельзя начать новую раздачу.");
        return cur;
      }
    });
  }
  function message(m: ChatMessage) {
    setSession((cur) =>
      cur ? { ...cur, chat: [...cur.chat, m], updatedAt: Date.now() } : cur,
    );
  }
  async function addMatch(match: SavedMatch) {
    await storage.putMatch(match);
    setMatches((prev) =>
      [match, ...prev.filter((m) => m.id !== match.id)].sort(
        (a, b) => b.finishedAt - a.finishedAt,
      ),
    );
  }
  async function removeMatch(id: string) {
    await storage.deleteMatch(id);
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }
  function changeSpeed(value: number) {
    setSpeed(value);
    storage.setPreference("botDelay", String(value));
  }
  return {
    session,
    view,
    state,
    matches,
    ready,
    error,
    setError,
    saving,
    action,
    start,
    next,
    message,
    addMatch,
    removeMatch,
    speed,
    changeSpeed,
  };
}
