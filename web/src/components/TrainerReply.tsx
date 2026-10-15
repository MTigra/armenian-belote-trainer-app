import type { Action } from "../lib/types";
import type { TrainerAnswer } from "../lib/trainerTypes";
import { ranks, suitNames } from "../lib/types";
export function actionLabel(action: Action): string {
  if (action.type === "play")
    return `${ranks[action.card.rank]} ${suitNames[action.card.suit]}`;
  if (action.type === "bid")
    return `Заявка ${action.amount}, ${action.trump ? suitNames[action.trump] : "бой"}${action.caput ? ", капут" : ""}`;
  return {
    pass: "Пас",
    double: "Контра",
    redouble: "Реконтра",
    "decline-redouble": "Без реконтры",
    declare: "Показать объявления",
    "decline-declarations": "Не показывать объявления",
  }[action.type];
}
export default function TrainerReply({ answer }: { answer: TrainerAnswer }) {
  return (
    <>
      {answer.suggestion && (
        <p>
          <strong>Совет: {actionLabel(answer.suggestion)}</strong>
        </p>
      )}
      <p>{answer.explanation}</p>
      {answer.alternatives.length > 0 && (
        <ul>
          {answer.alternatives.map((a, i) => (
            <li key={i}>
              <strong>{actionLabel(a.action)}:</strong> {a.explanation}
            </li>
          ))}
        </ul>
      )}
      {answer.assumptions.length > 0 && (
        <p>
          <small>Предположения: {answer.assumptions.join("; ")}</small>
        </p>
      )}
      {answer.ruleRefs.length > 0 && (
        <small>Правила: {answer.ruleRefs.join(", ")}</small>
      )}
    </>
  );
}
