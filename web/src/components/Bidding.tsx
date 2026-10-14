import { useEffect, useState, type ReactNode } from "react";
import type {
  Action,
  PlayerView,
  Suit,
  Seat,
  PlayerPresence,
} from "../lib/types";
import { SUITS, symbols, suitNames, names } from "../lib/types";
import Icon from "./Icon";
import SuitImage from "./SuitImage";
import GameTableShell, { type TableClock } from "./GameTableShell";
export default function Bidding({
  view,
  onAction,
  onCoach,
  onMenu,
  labels = names,
  status,
  presence,
  clock,
  animate = true,
}: {
  view: PlayerView;
  onAction: (a: Action) => void;
  onCoach: () => void;
  onMenu: () => void;
  labels?: Record<Seat, string>;
  status?: ReactNode;
  presence?: PlayerPresence;
  clock?: TableClock;
  animate?: boolean;
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
  return (
    <GameTableShell
      view={view}
      onMenu={onMenu}
      onCoach={onCoach}
      labels={labels}
      presence={presence}
      clock={clock}
      status={status}
      animate={animate}
    >
      <div className="bid-controls blot-bidding" aria-label="Торговля">
        <div className="blot-current-bid">
          <span>
            {view.auction.contract
              ? `Заявка: ${labels[view.auction.contract.bidder]}`
              : "Заявок пока нет"}
          </span>
          <b>
            {view.auction.contract?.amount ?? "—"}{" "}
            {view.auction.contract?.trump ? (
              <SuitImage suit={view.auction.contract.trump} />
            ) : view.auction.contract ? (
              "Бой"
            ) : (
              ""
            )}
            {view.auction.multiplier > 1 ? ` ×${view.auction.multiplier}` : ""}
            {view.auction.contract?.promisedCaput ? " · капут" : ""}
          </b>
        </div>
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
                  <SuitImage suit={s} />
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
              {view.options.mayDouble && (
                <button
                  className="double-button"
                  onClick={() => onAction({ type: "double", seat: "SOUTH" })}
                >
                  Контра
                </button>
              )}
            </div>
            <p className="bid-help">
              {min === null
                ? "Ожидаем остальных игроков."
                : `Следующая заявка — от ${min}. Торговля закрывается четырьмя пасами.`}
            </p>
          </>
        )}
      </div>
    </GameTableShell>
  );
}
