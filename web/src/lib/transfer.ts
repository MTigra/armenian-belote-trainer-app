import { SEATS } from "./types";
import type { SavedMatch, ChatMessage, Seat } from "./types";
import { validateRecord, SUPPORTED_PROFILES } from "./engine";
export function exportMatch(match: SavedMatch): string {
  return JSON.stringify(
    {
      application: "armenian-blot",
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      match,
    },
    null,
    2,
  );
}
export function importMatch(text: string): SavedMatch {
  if (text.length > 10 * 1024 * 1024)
    throw new Error("Файл слишком большой (максимум 10 МБ)");
  const envelope = JSON.parse(text);
  if (
    envelope.application !== "armenian-blot" ||
    envelope.exportVersion !== 1 ||
    !envelope.match
  )
    throw new Error("Неизвестный формат файла");
  if (!SUPPORTED_PROFILES.includes(envelope.match.record?.profileVersion))
    throw new Error("Версия правил этого матча пока не поддерживается");
  const { record, state } = validateRecord(envelope.match.record);
  const source = envelope.match;
  const chat: ChatMessage[] = Array.isArray(source.chat)
    ? source.chat
        .filter(
          (m: ChatMessage) =>
            m &&
            ["user", "coach"].includes(m.role) &&
            typeof m.text === "string" &&
            m.text.length <= 10000 &&
            typeof m.moment?.action === "number" &&
            typeof m.moment?.deal === "number",
        )
        .map((m: ChatMessage) => ({
          ...m,
          id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
        }))
    : [];
  return {
    id:
      typeof source.id === "string" && source.id.length <= 100
        ? source.id
        : crypto.randomUUID(),
    record,
    chat,
    scores: state.scores,
    winner: state.winner,
    createdAt: Number.isFinite(source.createdAt)
      ? source.createdAt
      : Date.now(),
    ...(SEATS.includes(source.seat) ? { seat: source.seat as Seat } : {}),
    ...(source.source === "online" ? { source: "online" as const } : {}),
    ...(source.players &&
    SEATS.every(
      (seat) =>
        typeof source.players[seat] === "string" &&
        source.players[seat].length <= 32,
    )
      ? {
          players: Object.fromEntries(
            SEATS.map((seat) => [seat, source.players[seat]]),
          ) as Record<Seat, string>,
        }
      : {}),
    ...([null, 30, 60, 120].includes(source.timerSeconds)
      ? { timerSeconds: source.timerSeconds }
      : {}),
    finishedAt: Number.isFinite(source.finishedAt)
      ? source.finishedAt
      : Date.now(),
  };
}
export function downloadMatch(match: SavedMatch): void {
  const url = URL.createObjectURL(
    new Blob([exportMatch(match)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `blot-${match.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
