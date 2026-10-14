import type { PlayerView, Seat } from "../lib/types";
import { dealEvents, names, cardKey } from "../lib/types";
import PlayingCard from "./PlayingCard";
import Modal from "./Modal";
import { declarationTitle } from "../lib/tablePresentation";
export default function Announcements({
  view,
  onClose,
  labels = names,
}: {
  view: PlayerView;
  onClose: () => void;
  labels?: Record<Seat, string>;
}) {
  const events = dealEvents(view.events),
    announced = events.filter((e) => e.announcement),
    shown = events.flatMap((e) => (e.declaration ? [e.declaration] : []));
  return (
    <Modal title="Объявления раздачи" onClose={onClose}>
      <h2>Объявления</h2>
      {announced.map((event, index) => {
        const a = event.announcement!;
        const cards = shown.filter((d) => d.owner === a.owner);
        return (
          <div className="announcement-row" key={index}>
            <strong>{labels[a.owner]}</strong>
            <p>
              {declarationTitle(a)} · {a.points} очков раздачи
            </p>
            {cards.length ? (
              cards.map((d, i) => (
                <div className="announcement-cards" key={i}>
                  {d.cards.map((c) => (
                    <PlayingCard key={cardKey(c)} card={c} />
                  ))}
                </div>
              ))
            ) : (
              <span>
                Карты ещё не показаны или объявление не засчитывается.
              </span>
            )}
          </div>
        );
      })}
      {events
        .filter((e) => e.kind === "BLOT" || e.kind === "REBLOT")
        .map((e, i) => (
          <p key={i}>
            {labels[e.seat ?? "SOUTH"]}: {e.kind === "BLOT" ? "блот" : "реблот"}
          </p>
        ))}
    </Modal>
  );
}
