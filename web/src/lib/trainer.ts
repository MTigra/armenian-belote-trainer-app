import type { PlayerView } from "./types";
import { serverOrigin } from "./onlineApi";
export interface TrainerAnswer {
  explanation: string;
  suggestion?: unknown;
  alternatives?: unknown[];
}
export async function askTrainer(
  context: PlayerView,
  question: string,
  accessCode: string,
  signal: AbortSignal,
): Promise<TrainerAnswer> {
  const response = await fetch(`${serverOrigin()}/api/trainer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, question, accessCode }),
    signal,
  });
  if (
    response.status === 404 ||
    response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("Сервис тренера пока не подключён. Игру можно продолжить.");
  if (response.status === 401 || response.status === 403)
    throw new Error("Код доступа не принят. Проверьте код и повторите запрос.");
  if (
    response.status === 503 &&
    (
      await response
        .clone()
        .json()
        .catch(() => null)
    )?.code === "TRAINER_UNAVAILABLE"
  )
    throw new Error("Сервис тренера пока не подключён. Игру можно продолжить.");
  if (!response.ok)
    throw new Error("Тренер сейчас недоступен. Попробуйте ещё раз.");
  const result = await response.json();
  if (typeof result.explanation !== "string")
    throw new Error("Тренер прислал неподдерживаемый ответ.");
  return result;
}
