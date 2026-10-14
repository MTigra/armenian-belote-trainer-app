import type { CSSProperties } from "react";
import type { Card, PlayerView, Seat } from "../lib/types";
import { cardKey, names, symbols, dealEvents } from "../lib/types";
import Icon from "./Icon";
import PlayingCard from "./PlayingCard";
import TrickCards from "./TrickCards";
export function Players({
  view,
  bidding = false,
}: {
  view: PlayerView;
  bidding?: boolean;
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
            className={`${bidding ? `bid-opponent bid-${seat === "NORTH" ? "north" : seat === "WEST" ? "west" : "east"}` : `player player-${pos}`} ${active ? "active-player" : ""}`}
          >
            <div
              className={`avatar ${seat === "NORTH" ? "avatar-gold" : seat === "WEST" ? "avatar-blue" : "avatar-rust"}`}
            >
              {names[seat][0]}
              {seat === "NORTH" && !bidding && (
                <span className="partner-badge">
                  <Icon name="link" />
                </span>
              )}
            </div>
            <div className="player-label">
              {names[seat]}
              <span>{seat === "NORTH" ? "Партнёр" : "Соперник"}</span>
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
}: {
  view: PlayerView;
  onPlay: (card: Card) => void;
  onCoach: () => void;
  onMenu: () => void;
  onDeclarations: () => void;
}) {
  const legal = new Set(view.options.cards.map(cardKey));
  const current = view.trick.length
    ? view.trick
    : (view.tricks.at(-1)?.plays ?? []);
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
            <div>
              <span className="team-dot ours" />
              Мы<strong>{view.scores.northSouth}</strong>
            </div>
            <div>
              <span className="team-dot theirs" />
              Они<strong>{view.scores.eastWest}</strong>
            </div>
            <div className="score-meta">До {view.target}</div>
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
                    {symbols[view.auction.contract.trump]}
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
          <Players view={view} />
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
            <TrickCards plays={current} />
          </div>
          <div className="turn-prompt" role="status">
            <span className="turn-dot" />
            {finished
              ? "Раздача завершена"
              : view.turn === "SOUTH"
                ? "Ваш ход"
                : `Ход: ${names[view.turn]}`}
          </div>
          {decl && (
            <div className="declaration-note">
              {names[decl.seat ?? "SOUTH"]}:{" "}
              {decl.kind === "REBLOT"
                ? "реблот"
                : decl.announcement?.kind === "FOUR_EIGHTS"
                  ? "четыре восьмёрки"
                  : decl.announcement
                    ? `объявление ${decl.announcement.points / 10}`
                    : "показ комбинаций"}
            </div>
          )}
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
            Откройте чат, чтобы обсудить текущий момент. В офлайн-игре боты
            будут ждать.
          </p>
          <p className="coach-status">Сервис AI пока не подключён.</p>
        </div>
        <button className="menu-secondary" onClick={onCoach}>
          Открыть чат
          <Icon name="arrow" />
        </button>
      </aside>
    </div>
  );
}
