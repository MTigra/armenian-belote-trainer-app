import { serverOrigin } from "./onlineApi";
import { SEATS, SUITS } from "./types";
import type { Action, ChatMessage } from "./types";
import type {
  TrainerAnswer,
  TrainerMoment,
  TrainerPerspective,
  TrainerRequest,
} from "./trainerTypes";
export type { TrainerAnswer } from "./trainerTypes";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).length === allowed.length &&
  Object.keys(v).every((k) => allowed.includes(k));
const integer = (v: unknown, min = 0): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && Array.from(v).length <= max;
export function isTrainerMoment(v: unknown): v is TrainerMoment {
  return (
    object(v) &&
    keys(v, ["matchId", "dealNumber", "actionIndex", "revision", "seat"]) &&
    text(v.matchId, 100) &&
    integer(v.dealNumber, 1) &&
    integer(v.actionIndex) &&
    (v.revision === null || integer(v.revision)) &&
    SEATS.includes(v.seat as never)
  );
}
export function isAction(v: unknown): v is Action {
  if (!object(v) || !SEATS.includes(v.seat as never)) return false;
  if (
    [
      "pass",
      "double",
      "redouble",
      "decline-redouble",
      "declare",
      "decline-declarations",
    ].includes(v.type as string)
  )
    return keys(v, ["type", "seat"]);
  if (v.type === "play")
    return (
      keys(v, ["type", "seat", "card"]) &&
      object(v.card) &&
      keys(v.card, ["suit", "rank"]) &&
      SUITS.includes(v.card.suit as never) &&
      [
        "SEVEN",
        "EIGHT",
        "NINE",
        "TEN",
        "JACK",
        "QUEEN",
        "KING",
        "ACE",
      ].includes(v.card.rank as string)
    );
  return (
    v.type === "bid" &&
    keys(v, ["type", "seat", "amount", "trump", "caput"]) &&
    integer(v.amount, 8) &&
    v.amount <= 2147483647 &&
    (v.trump === null || SUITS.includes(v.trump as never)) &&
    typeof v.caput === "boolean" &&
    (!v.caput || v.amount >= 26)
  );
}
export function isTrainerAnswer(v: unknown): v is TrainerAnswer {
  if (
    !object(v) ||
    !keys(v, [
      "protocolVersion",
      "requestId",
      "moment",
      "perspective",
      "profileVersion",
      "answerType",
      "suggestion",
      "explanation",
      "alternatives",
      "assumptions",
      "ruleRefs",
      "validation",
    ])
  )
    return false;
  if (
    v.protocolVersion !== 1 ||
    !text(v.requestId, 36) ||
    !isTrainerMoment(v.moment) ||
    !["player", "all_hands"].includes(v.perspective as string) ||
    !["armenian-training-0.1", "armenian-training-0.2"].includes(
      v.profileVersion as string,
    ) ||
    !["advice", "rules", "analysis", "clarification"].includes(
      v.answerType as string,
    ) ||
    !text(v.explanation, 4000)
  )
    return false;
  if (
    v.suggestion !== null &&
    (!isAction(v.suggestion) || v.suggestion.seat !== v.moment.seat)
  )
    return false;
  if (
    !Array.isArray(v.alternatives) ||
    v.alternatives.length > 3 ||
    !v.alternatives.every(
      (a) =>
        object(a) &&
        keys(a, ["action", "explanation"]) &&
        isAction(a.action) &&
        a.action.seat === (v.moment as TrainerMoment).seat &&
        text(a.explanation, 1000),
    )
  )
    return false;
  if (
    !Array.isArray(v.assumptions) ||
    v.assumptions.length > 5 ||
    !v.assumptions.every((s) => text(s, 500)) ||
    !Array.isArray(v.ruleRefs) ||
    v.ruleRefs.length > 10 ||
    !v.ruleRefs.every((s) => typeof s === "string" && /^R\d{2}$/.test(s)) ||
    new Set(v.ruleRefs).size !== v.ruleRefs.length
  )
    return false;
  if (
    !object(v.validation) ||
    !keys(v.validation, ["format", "actions", "strategy"]) ||
    v.validation.format !== "passed" ||
    v.validation.strategy !== "not_evaluated"
  )
    return false;
  const actions = [v.suggestion, ...v.alternatives.map((a) => a.action)].filter(
    Boolean,
  );
  if (
    new Set(actions.map((a) => JSON.stringify(a))).size !== actions.length ||
    v.validation.actions !== (actions.length ? "passed" : "not_applicable")
  )
    return false;
  return v.answerType !== "clarification" || actions.length === 0;
}
export function trainerHistory(
  messages: ChatMessage[],
  moment: TrainerMoment,
  perspective: TrainerPerspective,
) {
  let length = 0;
  return messages
    .filter(
      (m) =>
        m.trainerMoment &&
        m.perspective === perspective &&
        m.trainerMoment.matchId === moment.matchId &&
        m.trainerMoment.seat === moment.seat &&
        m.trainerMoment.actionIndex <= moment.actionIndex &&
        m.trainerMoment.dealNumber <= moment.dealNumber,
    )
    .slice(-12)
    .reverse()
    .flatMap((m) => {
      const content = Array.from(m.text).slice(0, 2000).join("");
      length += Array.from(content).length;
      return length <= 12000
        ? [
            {
              role: m.role,
              text: content,
              moment: m.trainerMoment!,
              perspective,
            },
          ]
        : [];
    })
    .reverse();
}
export class TrainerFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}
export async function askTrainer(
  request: TrainerRequest,
  signal: AbortSignal,
  token?: string,
): Promise<TrainerAnswer> {
  const response = await fetch(`${serverOrigin()}/api/trainer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal,
  });
  if (response.headers.get("content-type")?.includes("text/html"))
    throw new TrainerFailure(
      "Сервис тренера пока не подключён. Игру можно продолжить.",
      "TRAINER_UNAVAILABLE",
      false,
    );
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = object(result) ? result : {};
    throw new TrainerFailure(
      typeof failure.message === "string"
        ? failure.message
        : "Тренер сейчас недоступен. Игру можно продолжить.",
      typeof failure.code === "string" ? failure.code : "TRAINER_UNAVAILABLE",
      failure.retryable === true,
      integer(failure.retryAfterSeconds) ? failure.retryAfterSeconds : null,
    );
  }
  if (!isTrainerAnswer(result) || result.requestId !== request.requestId)
    throw new TrainerFailure(
      "Тренер прислал неподдерживаемый ответ.",
      "TRAINER_INVALID_RESPONSE",
      true,
    );
  const s = request.source;
  if (
    s.kind === "online"
      ? result.moment.revision !== s.expectedRevision ||
        result.perspective !== "player"
      : result.moment.matchId !== s.localMatchId ||
        result.moment.actionIndex !== s.actionIndex ||
        result.moment.dealNumber !==
          (s.kind === "offline" ? s.view.dealNumber : s.dealNumber) ||
        result.moment.seat !== (s.kind === "offline" ? s.view.seat : s.seat) ||
        result.perspective !== (s.kind === "offline" ? "player" : s.perspective)
  )
    throw new TrainerFailure(
      "Ответ относится к другому моменту партии.",
      "TRAINER_INVALID_RESPONSE",
      true,
    );
  return result;
}
