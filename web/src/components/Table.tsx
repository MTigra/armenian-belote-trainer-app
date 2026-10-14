import { useState, type ReactNode } from "react";
import type { Card, PlayerView, Seat, PlayerPresence } from "../lib/types";
import { cardKey, names } from "../lib/types";
import { declarationTitle } from "../lib/tablePresentation";
import PlayingCard from "./PlayingCard";
import TrickCards from "./TrickCards";
import Modal from "./Modal";
import GameTableShell, { type TableClock } from "./GameTableShell";
import { useTrickMotion } from "../lib/useTrickMotion";
export default function Table({
  view,
  onPlay,
  onCoach,
  onMenu,
  onDeclarations,
  onDeclarationChoice,
  animate = true,
  labels = names,
  status,
  presence,
  clock,
  overlaid = false,
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
  clock?: TableClock;
  overlaid?: boolean;
}) {
  const motion = useTrickMotion(view, animate);
  const [lastOpen, setLastOpen] = useState(false);
  const last = view.tricks.at(-1);
  return (
    <>
      <GameTableShell
        view={view}
        onPlay={onPlay}
        onCoach={onCoach}
        onMenu={onMenu}
        onDeclarations={onDeclarations}
        labels={labels}
        presence={presence}
        status={status}
        clock={clock}
        animate={animate}
      >
        <div className="trick blot-trick">
          <TrickCards
            plays={view.trick}
            labels={labels}
            fresh={motion.fresh}
            dealNumber={view.dealNumber}
          />
        </div>
        {motion.collection && (
          <div
            className="trick blot-trick trick-collection"
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
            className="last-trick blot-last-trick"
            aria-label="Последняя взятка"
            onClick={() => setLastOpen(true)}
          >
            <span>Последняя взятка</span>
            <div>
              {last.plays.map((p) => (
                <PlayingCard key={p.seat} card={p.card} />
              ))}
            </div>
          </button>
        )}
      </GameTableShell>
      {view.options.mayDeclare && !overlaid && (
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
                {declarationTitle(d)} · {d.points} очков раздачи
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
    </>
  );
}
