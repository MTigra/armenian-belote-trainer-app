import { useMemo, useState } from "react";
import type { SavedMatch, PlayerView } from "../lib/types";
import { SEATS, names, cardKey, symbols } from "../lib/types";
import { replayAt, stateOf, viewOf } from "../lib/engine";
import { ownTotals, presentView, relativeSeat } from "../lib/presentation";
import { downloadMatch } from "../lib/transfer";
import Icon from "./Icon";
import PlayingCard from "./PlayingCard";
import TrickCards from "./TrickCards";
export default function Review({
  match,
  onBack,
  onCoach,
  onDelete,
}: {
  match: SavedMatch;
  onBack: () => void;
  onCoach: (v: PlayerView, cursor: number) => void;
  onDelete: () => void;
}) {
  const [cursor, setCursor] = useState(0),
    [full, setFull] = useState(false);
  const snapshot = useMemo(
    () => replayAt(match.record, cursor),
    [match.record, cursor],
  );
  const state = useMemo(() => stateOf(snapshot), [snapshot]);
  const rawView = useMemo(
    () => viewOf(snapshot, match.seat ?? "SOUTH"),
    [snapshot, match.seat],
  );
  const view = useMemo(() => presentView(rawView), [rawView]);
  const actualNames = {
    ...names,
    ...match.players,
    [match.seat ?? "SOUTH"]: "Вы",
  };
  const labels = Object.fromEntries(
    SEATS.map((seat) => [
      relativeSeat(seat, match.seat ?? "SOUTH"),
      actualNames[seat],
    ]),
  ) as typeof names;
  const score = ownTotals(match.scores, match.seat ?? "SOUTH");
  const action = match.record.actions[cursor - 1];
  const plays = view.trick.length
    ? view.trick
    : (view.tricks.at(-1)?.plays ?? []);
  const description = action
    ? `${actualNames[action.seat]}: ${action.type === "play" ? `${symbols[action.card.suit]} ${action.card.rank}` : action.type === "bid" ? `заявка ${action.amount} ${action.trump ? symbols[action.trump] : "бой"}` : action.type === "pass" ? "пас" : action.type === "double" ? "контра" : action.type === "redouble" ? "реконтра" : "без реконтры"}`
    : "Начало матча";
  return (
    <section className="view active">
      <div className="review-heading">
        <button className="text-button" onClick={onBack}>
          <Icon name="back" />
          Все игры
        </button>
        <button className="text-button" onClick={() => downloadMatch(match)}>
          <Icon name="download" />
          Экспорт
        </button>
      </div>
      <div className="review-grid">
        <div className="review-column">
          <div className="review-summary">
            <span className="review-kicker">Разбор матча</span>
            <h2>
              {score.northSouth}
              <span>:</span>
              {score.eastWest}
            </h2>
            <p>
              {labels.SOUTH} и {labels.NORTH}{" "}
              <span>
                против {labels.WEST} и {labels.EAST}
              </span>
            </p>
          </div>
          <div className="review-snapshot">
            <div className="snapshot-top">
              <span>
                Раздача {view.dealNumber} · {labels[view.turn]}
              </span>
              <span>
                {view.auction.contract
                  ? `${view.auction.contract.amount} ${view.auction.contract.trump ? symbols[view.auction.contract.trump] : "бой"}`
                  : "Торговля"}
              </span>
            </div>
            <div className="snapshot-cards">
              <TrickCards plays={plays} labels={labels} />
            </div>
            <p>{description}</p>
          </div>
          <div className="replay-controls">
            <button
              className="icon-button"
              disabled={cursor === 0}
              onClick={() => setCursor((v) => v - 1)}
              aria-label="Предыдущее действие"
            >
              <Icon name="back" />
            </button>
            <div>
              <strong>
                Действие {cursor} из {match.record.actions.length}
              </strong>
              <span>
                Раздача {view.dealNumber} · взятка {view.tricks.length + 1}
              </span>
            </div>
            <button
              className="icon-button"
              disabled={cursor === match.record.actions.length}
              onClick={() => setCursor((v) => v + 1)}
              aria-label="Следующее действие"
            >
              <Icon name="arrow" />
            </button>
          </div>
          <input
            className="replay-slider"
            type="range"
            min={0}
            max={match.record.actions.length}
            value={cursor}
            aria-label="Момент матча"
            onChange={(e) => setCursor(Number(e.target.value))}
          />
          <label className="full-layout-toggle">
            <input
              type="checkbox"
              checked={full}
              onChange={(e) => setFull(e.target.checked)}
            />
            Полная раскладка завершённого матча
          </label>
          <div className="review-hands">
            {(full ? SEATS : ([match.seat ?? "SOUTH"] as const)).map((seat) => (
              <div key={seat}>
                <strong>{actualNames[seat]}</strong>
                <div>
                  {state.hands[seat].map((c) => (
                    <PlayingCard key={cardKey(c)} card={c} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            className="review-coach-button"
            onClick={() => onCoach(rawView, cursor)}
          >
            <Icon name="spark" />
            Обсудить этот момент
          </button>
        </div>
        <aside className="review-details">
          <h3>Запись матча</h3>
          <p>Профиль: {match.record.profileVersion}</p>
          <p>Раздачи, торговля и все ходы сохранены на этом устройстве.</p>
          {match.chat.length > 0 && (
            <>
              <h3>Диалоги с тренером</h3>
              {match.chat.map((m) => (
                <div className={`message ${m.role}`} key={m.id}>
                  <small>
                    Раздача {m.moment.deal} · действие {m.moment.action}
                  </small>
                  {m.text}
                </div>
              ))}
            </>
          )}
          <button className="text-button danger" onClick={onDelete}>
            Удалить локальную запись
          </button>
        </aside>
      </div>
    </section>
  );
}
