import type { PlayedCard, Seat } from "../lib/types";
import { names } from "../lib/types";
import PlayingCard from "./PlayingCard";
import { playKey } from "../lib/useTrickMotion";

export default function TrickCards({
  plays,
  labels = names,
  fresh = [],
  dealNumber = 0,
}: {
  plays: PlayedCard[];
  labels?: Record<Seat, string>;
  fresh?: string[];
  dealNumber?: number;
}) {
  return (
    <div className="trick-cards" role="group" aria-label="Карты на столе">
      {plays.map(({ seat, card }) => (
        <div
          className="trick-play"
          data-seat={seat}
          key={seat}
          role="group"
          aria-label={`Карта: ${labels[seat]}`}
        >
          <div
            className={
              fresh.includes(playKey(dealNumber, seat, card))
                ? "card-throw"
                : "card-rest"
            }
          >
            <PlayingCard card={card} />
          </div>
        </div>
      ))}
    </div>
  );
}
