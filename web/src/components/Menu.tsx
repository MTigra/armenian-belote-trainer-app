import type { Session } from "../lib/types";
import Icon from "./Icon";
import PlayingCard from "./PlayingCard";
export default function Menu({
  active,
  onContinue,
  onTraining,
  onJoin,
  onHistory,
  onHelp,
}: {
  active: Session | null;
  onContinue: () => void;
  onTraining: () => void;
  onJoin: () => void;
  onHistory: () => void;
  onHelp: () => void;
}) {
  return (
    <section aria-label="Главное меню" className="view active">
      <div className="main-menu">
        <div className="menu-profile">
          <span className="profile-avatar">А</span>
          <span>Арам</span>
          <button className="icon-button" onClick={onHelp} aria-label="Об игре">
            <Icon name="book" />
          </button>
        </div>
        <div className="menu-identity">
          <span className="menu-emblem">Բ</span>
          <h1>Базар блот</h1>
          <p>Армянский блот</p>
        </div>
        <div className="menu-cards" aria-hidden="true">
          <PlayingCard card={{ suit: "SPADES", rank: "ACE" }} />
          <PlayingCard card={{ suit: "HEARTS", rank: "KING" }} />
          <PlayingCard card={{ suit: "DIAMONDS", rank: "ACE" }} />
        </div>
        <div className="menu-actions">
          {active && (
            <button className="continue-button" onClick={onContinue}>
              <Icon name="cards" />
              Продолжить партию
              <Icon name="arrow" />
            </button>
          )}
          <button className="menu-primary" onClick={onJoin}>
            <span>
              <Icon name="players" />
            </span>
            <span>Играть с людьми</span>
            <Icon name="arrow" />
          </button>
          <button className="menu-secondary" onClick={onTraining}>
            <span>
              <Icon name="cards" />
            </span>
            <span>{active ? "Новая тренировка" : "Тренировка с ботами"}</span>
            <Icon name="arrow" />
          </button>
          <button className="menu-history" onClick={onHistory}>
            <Icon name="history" />
            Мои игры
            <span>
              <Icon name="arrow" />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
