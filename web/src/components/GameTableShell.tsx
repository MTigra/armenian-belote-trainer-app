import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import type { Card, PlayerPresence, PlayerView, Seat } from "../lib/types";
import { cardKey, names, SEATS } from "../lib/types";
import { activeSeats, firstLead, sortedHand } from "../lib/tablePresentation";
import { useOrientation } from "../lib/useOrientation";
import { usePlayerAnnouncements } from "../lib/usePlayerAnnouncements";
import PlayingCard from "./PlayingCard";
import SuitImage from "./SuitImage";
import Icon from "./Icon";

export interface TableClock {
  deadlines: Partial<Record<Seat, number>>;
  timerSeconds: number | null;
  offset: number;
}
export interface TableShellProps {
  view: PlayerView;
  labels?: Record<Seat, string>;
  presence?: PlayerPresence;
  clock?: TableClock;
  status?: ReactNode;
  onMenu: () => void;
  onCoach: () => void;
  onPlay?: (card: Card) => void;
  animate?: boolean;
  children?: ReactNode;
  onDeclarations?: () => void;
}
function Scoreboard({ view }: { view: PlayerView }) {
  const points =
    view.currentPoints ??
    view.tricks.reduce(
      (sum, t) => {
        sum[
          t.winner === "SOUTH" || t.winner === "NORTH"
            ? "northSouth"
            : "eastWest"
        ] += t.cardPoints;
        return sum;
      },
      { northSouth: 0, eastWest: 0 },
    );
  const trump = view.auction.contract?.trump;
  return (
    <div className="blot-scoreboard" aria-label="Счёт команд">
      <div className="blot-team">
        <span>Мы</span>
        <strong aria-label="Наш счёт партии">{view.scores.northSouth}</strong>
        <span className="blot-deal-points">
          Раздача <b aria-label="Наши очки раздачи">{points.northSouth}</b>
        </span>
      </div>
      <div className="blot-contract">
        <span>
          {view.auction.contract ? (trump ? "Козырь" : "Контракт") : "Козырь"}
        </span>
        <div className="blot-trump">
          {trump ? (
            <SuitImage suit={trump} />
          ) : view.auction.contract ? (
            <b>Бой</b>
          ) : (
            <span>—</span>
          )}
        </div>
        <small>До {view.target}</small>
      </div>
      <div className="blot-team">
        <span>Они</span>
        <strong aria-label="Счёт партии соперников">
          {view.scores.eastWest}
        </strong>
        <span className="blot-deal-points">
          Раздача <b aria-label="Очки раздачи соперников">{points.eastWest}</b>
        </span>
      </div>
    </div>
  );
}
export default function GameTableShell({
  view,
  labels = names,
  presence = {},
  clock,
  status,
  onMenu,
  onCoach,
  onPlay,
  animate = true,
  children,
  onDeclarations,
}: TableShellProps) {
  const orientation = useOrientation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clock || clock.timerSeconds === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [clock?.timerSeconds]);
  const active = activeSeats(view),
    lead = firstLead(view);
  const notices = usePlayerAnnouncements(view, animate);
  const bidding = view.phase === "BIDDING" || view.phase === "REDOUBLE";
  const cards = sortedHand(view.hand, view.auction.contract?.trump ?? null);
  const legal = new Set(view.options.cards.map(cardKey));
  const ourTurn = active.includes("SOUTH");
  const prompt = view.options.mayDeclare
    ? "Показать объявления?"
    : view.phase === "REDOUBLE"
      ? ourTurn
        ? "Ответьте на контру"
        : "Ожидаем ответ на контру"
      : bidding
        ? ourTurn
          ? "Ваша очередь"
          : `Слово: ${labels[view.auction.turn]}`
        : view.phase !== "PLAYING"
          ? "Раздача завершена"
          : ourTurn
            ? "Ваш ход"
            : `Ход: ${labels[view.turn]}`;
  return (
    <div className={`blot-layout game-layout ${orientation}`}>
      <div
        className={`game-board blot-board ${bidding ? "bid-table" : ""}`}
        id={bidding ? undefined : "board"}
        data-phase={view.phase}
        data-orientation={orientation}
      >
        <div className="blot-felt" />
        <div className="blot-oval" />
        <Scoreboard view={view} />
        <button className="blot-menu" onClick={onMenu} aria-label="Меню партии">
          <Icon name="menu" />
        </button>
        {SEATS.map((seat) => {
          const deadline = clock?.deadlines[seat];
          const remaining =
            deadline === undefined
              ? null
              : Math.max(0, (deadline - now - (clock?.offset ?? 0)) / 1000);
          const ratio =
            remaining === null || !clock?.timerSeconds
              ? 1
              : Math.min(1, remaining / clock.timerSeconds);
          const isActive = active.includes(seat);
          const messages = notices.filter((n) => n.seat === seat);
          return (
            <div
              key={seat}
              className="blot-seat"
              data-seat={seat}
              data-active={isActive}
              data-urgency={
                remaining !== null && remaining <= 3
                  ? "critical"
                  : remaining !== null && remaining <= 10
                    ? "warning"
                    : "normal"
              }
              data-connection={
                presence[seat]?.bot
                  ? "bot"
                  : presence[seat]?.connected === false
                    ? "waiting"
                    : "connected"
              }
            >
              <div className="blot-avatar-shell">
                <svg
                  className="blot-clock"
                  viewBox="0 0 58 58"
                  role="img"
                  aria-label={
                    isActive
                      ? remaining === null
                        ? `Ход: ${labels[seat]}`
                        : `Осталось ${Math.ceil(remaining)} секунд`
                      : labels[seat]
                  }
                >
                  <circle className="blot-clock-track" cx="29" cy="29" r="27" />
                  <circle
                    className="blot-clock-ring"
                    cx="29"
                    cy="29"
                    r="27"
                    transform="rotate(-90 29 29)"
                    style={{
                      strokeDasharray: 169.646,
                      strokeDashoffset: 169.646 * (1 - ratio),
                    }}
                  />
                </svg>
                <div className="blot-avatar">{labels[seat][0]}</div>
                {isActive && remaining !== null && (
                  <span className="blot-clock-count">
                    {Math.ceil(remaining)}
                  </span>
                )}
                {lead === seat && (
                  <span
                    className="blot-first"
                    aria-label="Первый ход раздачи"
                    title="Первый ход раздачи"
                  >
                    1
                  </span>
                )}
              </div>
              <span className="blot-player-name">{labels[seat]}</span>
              {lead === seat && (
                <span className="blot-first-caption">Первый ход</span>
              )}
              {seat === "NORTH" && (
                <span className="blot-team-mark" title="Ваша команда">
                  Партнёр
                </span>
              )}
              {presence[seat]?.bot ? (
                <span className="blot-presence">Бот</span>
              ) : presence[seat]?.connected === false ? (
                <span className="blot-presence">Нет связи</span>
              ) : null}
              {messages.length > 0 && (
                <div className="blot-speech" role="status">
                  {messages.map((n) => (
                    <div key={n.key}>
                      <strong>{n.title}</strong>
                      {n.cards.length > 0 && (
                        <div className="blot-proof">
                          {n.cards.map((c) => (
                            <PlayingCard card={c} key={cardKey(c)} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="blot-playfield">{children}</div>
        <div className="blot-prompt" data-own-turn={ourTurn} role="status">
          {prompt}
        </div>
        {status && <div className="blot-network online-status">{status}</div>}
        <div
          className={`blot-hand ${bidding ? "bid-hand" : "hand"}`}
          aria-label={bidding ? "Ваши карты во время торговли" : "Ваши карты"}
          data-count={cards.length}
          style={
            {
              "--hand-count": cards.length,
              "--hand-gaps": Math.max(1, cards.length - 1),
            } as CSSProperties
          }
        >
          {cards.map((card, index) => (
            <PlayingCard
              key={cardKey(card)}
              card={card}
              index={index}
              total={cards.length}
              trump={card.suit === view.auction.contract?.trump}
              disabled={!legal.has(cardKey(card))}
              onClick={!bidding && onPlay ? () => onPlay(card) : undefined}
            />
          ))}
        </div>
        <button
          className="blot-coach"
          onClick={onCoach}
          aria-label={bidding ? "Спросить тренера" : "Тренер"}
          title="Тренер"
        >
          <Icon name="spark" />
        </button>
        {onDeclarations && (
          <button
            className="blot-events"
            disabled={notices.length > 0}
            onClick={onDeclarations}
            aria-label="Объявления"
            title="Объявления"
          >
            <Icon name="book" />
          </button>
        )}
      </div>
    </div>
  );
}
