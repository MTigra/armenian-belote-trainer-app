import type { PlayedCard } from "../lib/types";
import { names } from "../lib/types";
import PlayingCard from "./PlayingCard";

export default function TrickCards({ plays }: { plays: PlayedCard[] }) {
  return (
    <div className="trick-cards" role="group" aria-label="Карты на столе">
      {plays.map(({ seat, card }) => (
        <div
          className="trick-play"
          data-seat={seat}
          key={seat}
          role="group"
          aria-label={`Карта: ${names[seat]}`}
        >
          <PlayingCard card={card} />
        </div>
      ))}
    </div>
  );
}
