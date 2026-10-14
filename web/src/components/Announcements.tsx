import type { PlayerView } from "../lib/types";
import { dealEvents, names, ranks, cardKey } from "../lib/types";
import PlayingCard from "./PlayingCard";
import Modal from "./Modal";
export default function Announcements({
  view,
  onClose,
}: {
  view: PlayerView;
  onClose: () => void;
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
            <strong>{names[a.owner]}</strong>
            <p>
              {a.kind === "FOUR_EIGHTS"
                ? "Четыре восьмёрки"
                : a.kind === "FOUR"
                  ? `Рамка ${ranks[a.highRank]}`
                  : `Последовательность ${a.points / 10}`}{" "}
              · {a.points / 10} очков
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
            {names[e.seat ?? "SOUTH"]}: {e.kind === "BLOT" ? "блот" : "реблот"}
          </p>
        ))}
    </Modal>
  );
}
