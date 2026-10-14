import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ChatMessage, SavedMatch, Seat } from "./types";
import type {
  ConnectionState,
  GuestIdentity,
  OnlineCommand,
  OnlineMessage,
  MatchReceipt,
  TableSnapshot,
} from "./onlineTypes";
import {
  createGuest,
  createTable,
  guestStatus,
  joinTable,
  OnlineFailure,
  rememberGuest,
  serverOrigin,
  storedGuest,
  waitForOnlineServer,
} from "./onlineApi";
import { OnlineSocket } from "./OnlineSocket";
import { finishOnlineMatch, loadOnlineChat, saveOnlineChat } from "./storage";
import { validateRecord } from "./engine";

export function useOnlineGame(onSaved: (match: SavedMatch) => Promise<void>) {
  const [guest, setGuest] = useState<GuestIdentity | null>(storedGuest);
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const socket = useRef<OnlineSocket | null>(null);
  const current = useRef<TableSnapshot | null>(null);
  const identity = useRef(guest);
  const dialogue = useRef<ChatMessage[]>([]);
  const archived = useRef<SavedMatch | null>(null);
  const diaryId = useRef<string | null>(null);
  const entering = useRef(false);
  const entry = useRef<AbortController | null>(null);
  const cancelEntry = useCallback(() => entry.current?.abort(), []);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const writes = useRef(Promise.resolve());
  const pendingId = useRef<string | null>(null);
  const offset = useRef(0);
  function persistGuest(value: GuestIdentity | null) {
    identity.current = value;
    setGuest(value);
    try {
      rememberGuest(value);
    } catch {
      setError(
        "Не удалось сохранить гостевой доступ. После закрытия страницы место может потеряться.",
      );
    }
  }
  function updateChat(messages: ChatMessage[]) {
    dialogue.current = messages;
    setChat(messages);
  }
  async function receiveMatch(receipt: MatchReceipt) {
    setSaved(false);
    try {
      const { record, state } = validateRecord(receipt.record);
      const match: SavedMatch = {
        ...receipt,
        record,
        scores: state.scores,
        winner: state.winner,
        chat: dialogue.current,
        source: "online",
      };
      archived.current = match;
      setSaving(true);
      writes.current = writes.current
        .catch(() => {})
        .then(async () => {
          await finishOnlineMatch(match);
          await onSavedRef.current(match);
        });
      await writes.current;
      setSaved(true);
    } catch {
      setError(
        "Не удалось сохранить онлайн-матч. Не закрывайте страницу: запись пока доступна в памяти.",
      );
    } finally {
      setSaving(false);
    }
  }
  function receive(message: OnlineMessage) {
    if (message.snapshot) {
      const next = message.snapshot;
      if (diaryId.current !== next.id) {
        diaryId.current = next.id;
        archived.current = null;
        setSaved(false);
        updateChat([]);
        void loadOnlineChat(next.id)
          .then((messages) => {
            if (diaryId.current !== next.id) return;
            const merged = new Map(
              [...messages, ...dialogue.current].map((m) => [m.id, m]),
            );
            updateChat([...merged.values()]);
          })
          .catch(() => setError("Не удалось прочитать локальный диалог."));
      }
      current.current = next;
      offset.current = next.serverTime - Date.now();
      setSnapshot(next);
    }
    if (message.type === "ack" && message.requestId === pendingId.current) {
      pendingId.current = null;
      setPending(false);
    }
    if (message.error) {
      setError(message.error.message);
      setPending(false);
      pendingId.current = null;
      if (
        ["SESSION_EXPIRED", "TABLE_GONE", "NOT_MEMBER"].includes(
          message.error.code,
        )
      ) {
        setConnection("ended");
        current.current = null;
        setSnapshot(null);
        persistGuest(
          message.error.code === "SESSION_EXPIRED"
            ? null
            : identity.current
              ? { ...identity.current, tableCode: null }
              : null,
        );
      }
    }
    if (message.type === "left") {
      current.current = null;
      setSnapshot(null);
      setConnection("idle");
      setPending(false);
      if (identity.current)
        persistGuest({ ...identity.current, tableCode: null });
    }
    if (message.type === "finished") {
      setConnection("ended");
      setPending(false);
      pendingId.current = null;
      if (identity.current)
        persistGuest({ ...identity.current, tableCode: null });
      if (message.match) void receiveMatch(message.match);
    }
  }
  function attach(value: GuestIdentity, code: string) {
    socket.current?.close();
    persistGuest({ ...value, tableCode: code });
    const next = new OnlineSocket({
      guest: value,
      code,
      observer: {
        message: (message) => {
          if (socket.current === next) receive(message);
        },
        connection: (state) => {
          if (socket.current !== next) return;
          setConnection(state);
          if (state === "reconnecting") {
            setPending(false);
            pendingId.current = null;
          }
        },
      },
    });
    socket.current = next;
    next.open();
  }
  useEffect(() => {
    let cancelled = false;
    const saved = identity.current;
    if (saved)
      void guestStatus(saved)
        .then((status) => {
          if (cancelled) return;
          persistGuest({
            ...saved,
            nickname: status.nickname,
            tableCode: status.tableCode,
          });
          if (status.tableCode) attach(saved, status.tableCode);
        })
        .catch((failure) => {
          if (cancelled) return;
          if (
            failure instanceof OnlineFailure &&
            failure.code === "SESSION_EXPIRED"
          ) {
            persistGuest(null);
            return;
          }
          if (saved.tableCode) attach(saved, saved.tableCode);
        });
    return () => {
      cancelled = true;
      cancelEntry();
      socket.current?.close();
    };
  }, []);
  async function ensureGuest() {
    const cached = identity.current;
    if (cached?.origin === serverOrigin()) {
      try {
        await guestStatus(cached);
        return cached;
      } catch (failure) {
        if (
          !(failure instanceof OnlineFailure) ||
          failure.code !== "SESSION_EXPIRED"
        )
          throw failure;
      }
    }
    persistGuest(null);
    const value = await createGuest();
    persistGuest(value);
    return value;
  }
  async function enter(
    operation: (value: GuestIdentity) => Promise<TableSnapshot>,
  ) {
    if (entering.current) return false;
    entering.current = true;
    const controller = new AbortController();
    entry.current = controller;
    setBusy(true);
    setError("");
    try {
      await waitForOnlineServer(controller.signal);
      const value = await ensureGuest();
      if (controller.signal.aborted) return false;
      const table = await operation(value);
      if (controller.signal.aborted) return false;
      current.current = table;
      setSnapshot(table);
      attach(value, table.code);
      return true;
    } catch (failure) {
      if (controller.signal.aborted) return false;
      setError(
        failure instanceof Error ? failure.message : "Не удалось подключиться.",
      );
      if (
        failure instanceof OnlineFailure &&
        failure.code === "SESSION_EXPIRED"
      )
        persistGuest(null);
      return false;
    } finally {
      entry.current = null;
      entering.current = false;
      setBusy(false);
    }
  }
  function command(type: OnlineCommand["type"], action?: Action, seat?: Seat) {
    if (!current.current || connection !== "connected" || pendingId.current)
      return;
    const requestId = crypto.randomUUID();
    pendingId.current = requestId;
    setPending(true);
    setError("");
    try {
      socket.current?.send({
        type,
        requestId,
        expectedRevision: current.current.revision,
        ...(action ? { action } : {}),
        ...(seat ? { seat } : {}),
      });
    } catch (failure) {
      pendingId.current = null;
      setPending(false);
      setError(failure instanceof Error ? failure.message : "Нет соединения.");
    }
  }
  function message(value: ChatMessage) {
    const updated = [...dialogue.current, value];
    updateChat(updated);
    const match = archived.current;
    if (match) {
      const next = { ...match, chat: updated };
      archived.current = next;
      writes.current = writes.current
        .catch(() => {})
        .then(() => onSavedRef.current(next))
        .catch(() => setError("Не удалось сохранить диалог."));
      return;
    }
    const tableId = current.current?.id;
    if (tableId)
      writes.current = writes.current
        .catch(() => {})
        .then(() => saveOnlineChat(tableId, updated))
        .catch(() => setError("Не удалось сохранить диалог."));
  }
  function clearFinished() {
    if (snapshot?.status === "FINISHED") {
      socket.current?.close();
      current.current = null;
      setSnapshot(null);
      setConnection("idle");
    }
  }
  async function retrySave() {
    const match = archived.current;
    if (!match) return;
    setSaving(true);
    try {
      await finishOnlineMatch(match);
      await onSavedRef.current(match);
      setSaved(true);
      setError("");
    } catch {
      setError("Не удалось сохранить матч. Можно скачать запись.");
    } finally {
      setSaving(false);
    }
  }
  return {
    guest,
    snapshot,
    connection,
    error,
    setError,
    busy,
    cancelEntry,
    pending,
    saving,
    saved,
    completedMatch: archived.current,
    chat,
    clockOffset: offset.current,
    create: (name: string, timer: number | null) =>
      enter((value) => createTable(value, name, timer)),
    join: (code: string) => enter((value) => joinTable(value, code)),
    command,
    message,
    clearFinished,
    retrySave,
  };
}
export type OnlineGameController = ReturnType<typeof useOnlineGame>;
