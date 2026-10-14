import { useState, type CSSProperties, type ReactNode } from "react";
import type { Card, PlayerView, Seat, PlayerPresence } from "../lib/types";
import { cardKey, names, symbols, dealEvents } from "../lib/types";
import Icon from "./Icon";
import PlayingCard from "./PlayingCard";
import TrickCards from "./TrickCards";
import SuitImage from "./SuitImage";
import Modal from "./Modal";
import { useTrickMotion } from "../lib/useTrickMotion";
export function Players({
  view,
  bidding = false,
  labels = names,
  presence = {},
}: {
  view: PlayerView;
  bidding?: boolean;
  labels?: Record<Seat, string>;
  presence?: PlayerPresence;
}) {
  return (
    <>
      {(["NORTH", "WEST", "EAST"] as Seat[]).map((seat) => {
        const pos =
          seat === "NORTH" ? "top" : seat === "WEST" ? "left" : "right";
        const active =
          view.phase === "BIDDING"
            ? view.auction.turn === seat
            : view.phase === "PLAYING"
              ? view.turn === seat
              : view.auction.pendingRedouble.includes(seat);
        const bid = dealEvents(view.events)
          .filter(
            (e) =>
              e.seat === seat &&
              [
                "BID",
                "PASS",
                "DOUBLE",
                "REDOUBLE",
                "DECLINE_REDOUBLE",
              ].includes(e.kind),
          )
          .at(-1);
        return (
          <div
            key={seat}
            data-connection={
              presence[seat]?.bot
                ? "bot"
                : presence[seat]?.connected === false
                  ? "waiting"
                  : "connected"
            }
            className={`${bidding ? `bid-opponent bid-${seat === "NORTH" ? "north" : seat === "WEST" ? "west" : "east"}` : `player player-${pos}`} ${active ? "active-player" : ""}`}
          >
            <div
              className={`avatar ${seat === "NORTH" ? "avatar-gold" : seat === "WEST" ? "avatar-blue" : "avatar-rust"}`}
            >
              {labels[seat][0]}
              {(presence[seat]?.bot || presence[seat]?.connected === false) && (
                <span
                  className="presence-badge"
                  aria-label={
                    presence[seat]?.bot ? "Управляет бот" : "Нет связи"
                  }
                >
                  {presence[seat]?.bot ? "Б" : "!"}
                </span>
              )}
              {seat === "NORTH" && !bidding && (
                <span className="partner-badge">
                  <Icon name="link" />
                </span>
              )}
            </div>
            <div className="player-label">
              {labels[seat]}
              <span>
                {presence[seat]?.bot
                  ? "Бот"
                  : presence[seat]?.connected === false
                    ? "Нет связи"
                    : seat === "NORTH"
                      ? "Партнёр"
                      : "Соперник"}
              </span>
            </div>
            {bidding ? (
              <b>
                {bid?.kind === "BID"
                  ? `${bid.contract?.amount} ${bid.contract?.trump ? symbols[bid.contract.trump] : "бой"}`
                  : bid?.kind === "PASS"
                    ? "Пас"
                    : bid?.kind === "DOUBLE"
                      ? "Контра"
                      : bid?.kind === "REDOUBLE"
                        ? "Реконтра"
                        : "—"}
              </b>
            ) : seat === "NORTH" ? (
              <div
                className="back-hand"
                aria-label={`${view.handSizes[seat]} карт у партнёра`}
              >
                {Array.from({ length: view.handSizes[seat] }, (_, i) => (
                  <span className="card-back" key={i} />
                ))}
              </div>
            ) : (
              <span className="card-count">{view.handSizes[seat]} карт</span>
            )}
          </div>
        );
      })}
    </>
  );
}
export default function Table({
  view,
  onPlay,
  onCoach,
  onMenu,
  onDeclarations,
  onDeclarationChoice,
  animate = true,
  labels = names,
  online = false,
  status,
  presence,
}: {
  view: PlayerView;
  onPlay: (card: Card) => void;
  onCoach: () => void;
  onMenu: () => void;
  onDeclarations: () => void;
  onDeclarationChoice: (show: boolean) => void;
  animate?: boolean;
  labels?: Record<Seat, string>;
  online?: boolean;
  status?: ReactNode;
  presence?: PlayerPresence;
}) {
  const legal = new Set(view.options.cards.map(cardKey));
  const motion = useTrickMotion(view, animate);
  const [lastOpen, setLastOpen] = useState(false);
  const last = view.tricks.at(-1);
  // Compatibility with a server still using protocol 1; only public information.
  const points =
    view.currentPoints ??
    view.tricks.reduce(
      (total, trick) => {
        total[
          trick.winner === "SOUTH" || trick.winner === "NORTH"
            ? "northSouth"
            : "eastWest"
        ] += trick.cardPoints;
        return total;
      },
      { northSouth: 0, eastWest: 0 },
    );
  const finished = !["PLAYING"].includes(view.phase);
  const decl = dealEvents(view.events)
    .filter(
      (e) =>
        e.kind === "DECLARATION" ||
        e.kind === "REBLOT" ||
        e.kind === "DECLARATION_SHOWN",
    )
    .at(-1);
  return (
    <div className="game-layout">
      <div className="table-column">
        <div className="game-board" id="board" data-phase={view.phase}>
          <div className="felt-grain" />
          <div className="table-outline" />
          <button
            className="icon-button game-menu-button"
            onClick={onMenu}
            aria-label="Меню партии"
          >
            <Icon name="menu" />
          </button>
          <div className="scoreboard" aria-label="Счёт команд">
            <div className="score-columns">
              <span>Партия</span>
              <span>Раздача</span>
            </div>
            <div>
              <span className="team-dot ours" />
              Мы<strong>{view.scores.northSouth}</strong>
              <b className="deal-points" aria-label="Наши очки раздачи">
                {points.northSouth}
              </b>
            </div>
            <div>
              <span className="team-dot theirs" />
              Они<strong>{view.scores.eastWest}</strong>
              <b className="deal-points" aria-label="Очки раздачи соперников">
                {points.eastWest}
              </b>
            </div>
            <div className="score-meta">
              <span>До {view.target}</span>
              <span title="Взятые карты и показанные бонусы в карточных очках">
                Очки карт
              </span>
            </div>
          </div>
          <div className="round-info">
            <span>Раздача {view.dealNumber}</span>
            <div>
              {view.auction.contract?.trump ? (
                <>
                  Козырь{" "}
                  <b
                    className={
                      ["HEARTS", "DIAMONDS"].includes(
                        view.auction.contract.trump,
                      )
                        ? "suit-red"
                        : ""
                    }
                  >
                    <SuitImage suit={view.auction.contract.trump} />
                  </b>
                </>
              ) : (
                "Бой"
              )}
              <span className="contract-badge">
                {view.auction.contract?.amount}
                {view.auction.multiplier > 1
                  ? ` ×${view.auction.multiplier}`
                  : ""}
              </span>
            </div>
          </div>
          <Players view={view} labels={labels} presence={presence} />
          {decl && (
            <button className="declarations-button" onClick={onDeclarations}>
              Объявления
            </button>
          )}
          <div className="table-mark">
            <span>Բ</span>
            <p>Базар блот</p>
          </div>
          <div className="trick">
            <TrickCards
              plays={view.trick}
              labels={labels}
              fresh={motion.fresh}
              dealNumber={view.dealNumber}
            />
          </div>
          {motion.collection && (
            <div
              className="trick trick-collection"
              data-winner={motion.collection.winner}
              aria-label={`Взятку забирает ${labels[motion.collection.winner]}`}
            >
              <TrickCards
                plays={motion.collection.plays}
                labels={labels}
                fresh={motion.fresh}
                dealNumber={view.dealNumber}
              />
            </div>
          )}
          {last && (
            <button
              className="last-trick"
              aria-label="Последняя взятка"
              onClick={() => setLastOpen(true)}
            >
              <span>Бита · {labels[last.winner]}</span>
              <div>
                {last.plays.map((p) => (
                  <PlayingCard key={p.seat} card={p.card} />
                ))}
              </div>
            </button>
          )}
          <div className="turn-prompt" role="status">
            <span className="turn-dot" />
            {finished
              ? "Раздача завершена"
              : view.turn === "SOUTH"
                ? "Ваш ход"
                : `Ход: ${labels[view.turn]}`}
          </div>
          {decl && (
            <div className="declaration-note">
              {labels[decl.seat ?? "SOUTH"]}:{" "}
              {decl.kind === "REBLOT"
                ? "реблот"
                : decl.announcement?.kind === "FOUR_EIGHTS"
                  ? "четыре восьмёрки"
                  : decl.announcement
                    ? `объявление ${decl.announcement.points / 10}`
                    : "показ комбинаций"}
            </div>
          )}
          {status && <div className="online-status">{status}</div>}
          <div
            className="hand"
            aria-label="Ваши карты"
            data-count={view.hand.length}
            style={
              {
                "--hand-count": view.hand.length,
                "--hand-gaps": Math.max(1, view.hand.length - 1),
              } as CSSProperties
            }
          >
            {view.hand.map((c, i) => (
              <PlayingCard
                key={cardKey(c)}
                card={c}
                index={i}
                total={view.hand.length}
                disabled={!legal.has(cardKey(c))}
                onClick={() => onPlay(c)}
              />
            ))}
          </div>
          <button className="in-table-coach" onClick={onCoach}>
            <Icon name="spark" />
            Тренер
          </button>
        </div>
      </div>
      <aside className="coach-panel desktop-coach">
        <div className="coach-header">
          <span className="coach-logo">
            <Icon name="spark" />
          </span>
          <h2>Тренер</h2>
        </div>
        <div className="coach-messages">
          <p className="coach-status">
            Откройте чат, чтобы обсудить текущий момент.{" "}
            {online
              ? "В онлайн-партии игра продолжается."
              : "В офлайн-игре боты будут ждать."}
          </p>
          <p className="coach-status">Сервис AI пока не подключён.</p>
        </div>
        <button className="menu-secondary" onClick={onCoach}>
          Открыть чат
          <Icon name="arrow" />
        </button>
      </aside>
      {view.options.mayDeclare && (
        <Modal
          title="Показать объявления?"
          onClose={() => onDeclarationChoice(false)}
        >
          <h2>Показать объявления?</h2>
          <p>
            Объявим комбинации сейчас, а карты покажем перед вашим ходом во
            второй взятке. При отказе бонус не засчитывается.
          </p>
          {view.options.declarationsToShow?.map((d, i) => (
            <div className="declaration-choice" key={i}>
              <strong>
                {d.kind === "FOUR_EIGHTS"
                  ? "Четыре восьмёрки"
                  : d.kind === "FOUR"
                    ? "Рамка"
                    : "Последовательность"}{" "}
                · {d.points / 10} очков
              </strong>
              <div className="announcement-cards">
                {d.cards.map((c) => (
                  <PlayingCard key={cardKey(c)} card={c} />
                ))}
              </div>
            </div>
          ))}
          <button
            className="menu-primary"
            onClick={() => onDeclarationChoice(true)}
          >
            Показать объявления
          </button>
          <button
            className="menu-secondary"
            onClick={() => onDeclarationChoice(false)}
          >
            Не показывать
          </button>
          <button className="text-button" onClick={onCoach}>
            Спросить тренера
          </button>
        </Modal>
      )}
      {lastOpen && last && (
        <Modal title="Последняя взятка" onClose={() => setLastOpen(false)}>
          <h2>Взял: {labels[last.winner]}</h2>
          <p>{last.cardPoints} очков раздачи</p>
          <TrickCards plays={last.plays} labels={labels} />
        </Modal>
      )}
    </div>
  );
}
