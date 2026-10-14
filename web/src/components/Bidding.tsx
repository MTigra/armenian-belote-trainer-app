import { useEffect, useState } from "react";
import type { Action, PlayerView, Suit } from "../lib/types";
import { SUITS, symbols, suitNames, names, cardKey } from "../lib/types";
import Icon from "./Icon";
import PlayingCard from "./PlayingCard";
import { Players } from "./Table";
export default function Bidding({
  view,
  onAction,
  onCoach,
  onMenu,
}: {
  view: PlayerView;
  onAction: (a: Action) => void;
  onCoach: () => void;
  onMenu: () => void;
}) {
  const [suit, setSuit] = useState<Suit | null>("HEARTS"),
    [amount, setAmount] = useState(8),
    [caput, setCaput] = useState(false);
  const min = view.options.minimumBid;
  useEffect(() => {
    if (min !== null) setAmount(min);
  }, [min]);
  useEffect(() => {
    if (view.options.caputRequired) setCaput(true);
  }, [view.options.caputRequired]);
  const valid =
    min !== null &&
    Number.isInteger(amount) &&
    amount >= min &&
    amount <= 2147483647 &&
    (!caput || amount >= 26);
  const c = view.auction.contract;
  return (
    <div className="bid-layout">
      <div className="bid-table">
        <div className="felt-grain" />
        <button
          className="icon-button game-menu-button"
          onClick={onMenu}
          aria-label="Меню партии"
        >
          <Icon name="menu" />
        </button>
        <div className="bid-table-heading">
          <h1>{view.phase === "REDOUBLE" ? "Ответ на контру" : "Торговля"}</h1>
          <span>Раздача {view.dealNumber}</span>
        </div>
        <Players view={view} bidding />
        <div className="current-bid">
          <span>{c ? "Текущая заявка" : "Заявок пока нет"}</span>
          <strong>
            {c ? c.amount : "—"}{" "}
            {c &&
              (c.trump ? (
                <b>{symbols[c.trump]}</b>
              ) : (
                <b className="boi-label">бой</b>
              ))}
          </strong>
          <p>
            {c ? names[c.bidder] : ""}
            {view.auction.multiplier > 1
              ? ` · ×${view.auction.multiplier}`
              : ""}
            {c?.promisedCaput ? " · капут" : ""}
          </p>
        </div>
        <div className="bid-your-turn">
          <span className="turn-dot" />
          {view.phase === "REDOUBLE"
            ? "Команда отвечает на контру"
            : view.auction.turn === "SOUTH"
              ? "Ваша очередь"
              : `Слово: ${names[view.auction.turn]}`}
        </div>
        <div className="bid-hand" aria-label="Ваши карты во время торговли">
          {view.hand.map((c, i) => (
            <PlayingCard
              key={cardKey(c)}
              card={c}
              index={i}
              total={view.hand.length}
            />
          ))}
        </div>
        <button className="bid-coach" onClick={onCoach}>
          <Icon name="spark" />
          Спросить тренера
        </button>
      </div>
      <div className="bid-controls">
        {view.phase === "REDOUBLE" ? (
          <>
            <h2>Контра</h2>
            <p className="bid-help">
              Каждый игрок команды контракта может ответить отдельно.
            </p>
            <div className="bid-actions">
              <button
                className="pass-button"
                disabled={!view.options.mayDeclineRedouble}
                onClick={() =>
                  onAction({ type: "decline-redouble", seat: "SOUTH" })
                }
              >
                Без реконтры
              </button>
              <button
                className="play-button"
                disabled={!view.options.mayRedouble}
                onClick={() => onAction({ type: "redouble", seat: "SOUTH" })}
              >
                Реконтра
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Ваша заявка</h2>
            <fieldset className="bid-suits">
              <legend>Масть или бой</legend>
              {SUITS.map((s) => (
                <button
                  key={s}
                  className={`suit-choice ${["HEARTS", "DIAMONDS"].includes(s) ? "red" : ""} ${suit === s ? "selected" : ""}`}
                  aria-label={suitNames[s]}
                  aria-pressed={suit === s}
                  onClick={() => setSuit(s)}
                >
                  {symbols[s]}
                </button>
              ))}
              <button
                className={`suit-choice boi-choice ${suit === null ? "selected" : ""}`}
                aria-pressed={suit === null}
                onClick={() => setSuit(null)}
              >
                Бой
              </button>
            </fieldset>
            <label className="bid-amount-label" htmlFor="bid-amount">
              Количество малых очков
            </label>
            <div className="bid-stepper">
              <button
                aria-label="Уменьшить заявку"
                disabled={min === null || amount <= min}
                onClick={() => setAmount((v) => v - 1)}
              >
                −
              </button>
              <input
                id="bid-amount"
                aria-label="Количество очков заявки"
                type="number"
                inputMode="numeric"
                min={min ?? 8}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <button
                aria-label="Увеличить заявку"
                disabled={min === null || amount >= 2147483647}
                onClick={() => setAmount((v) => v + 1)}
              >
                +
              </button>
            </div>
            <label className="caput-toggle">
              <input
                type="checkbox"
                checked={caput}
                disabled={view.options.caputRequired}
                onChange={(e) => {
                  setCaput(e.target.checked);
                  if (e.target.checked) setAmount((v) => Math.max(26, v));
                }}
              />
              Обещать капут (от 26)
            </label>
            <div className="bid-actions">
              <button
                className="pass-button"
                disabled={!view.options.mayPass}
                onClick={() => onAction({ type: "pass", seat: "SOUTH" })}
              >
                Пас
              </button>
              <button
                className="play-button"
                disabled={!valid}
                onClick={() =>
                  onAction({
                    type: "bid",
                    seat: "SOUTH",
                    amount,
                    trump: suit,
                    caput,
                  })
                }
              >
                Заявить {amount} {suit ? symbols[suit] : "бой"}
              </button>
            </div>
            {view.options.mayDouble && (
              <button
                className="double-button"
                onClick={() => onAction({ type: "double", seat: "SOUTH" })}
              >
                Контра
              </button>
            )}
            <p className="bid-help">
              {min === null
                ? "Ожидаем остальных игроков."
                : `Следующая заявка — от ${min}. Торговля закрывается четырьмя пасами.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
