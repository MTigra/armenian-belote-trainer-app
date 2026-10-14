import type { CSSProperties } from "react";
import type { Card } from "../lib/types";
import { ranks, suitNames, cardKey } from "../lib/types";
export default function PlayingCard({
  card,
  disabled = false,
  onClick,
  index = 0,
  total = 1,
  trump = false,
}: {
  card: Card;
  disabled?: boolean;
  onClick?: () => void;
  index?: number;
  total?: number;
  trump?: boolean;
}) {
  const props = {
    className: `playing-card ${["HEARTS", "DIAMONDS"].includes(card.suit) ? "red" : ""} ${trump ? "is-trump" : ""}`,
    style: {
      "--angle": (index - (total - 1) / 2) * 2,
      "--curve": Math.abs(index - (total - 1) / 2) * 2,
    } as CSSProperties,
    "aria-label": `${ranks[card.rank]} ${suitNames[card.suit]}`,
  };
  const face = (
    <img
      className="card-face"
      src={`${import.meta.env.BASE_URL}cards/${cardKey(card)}.svg`}
      alt=""
      draggable={false}
    />
  );
  return onClick ? (
    <button {...props} onClick={onClick} disabled={disabled}>
      {face}
    </button>
  ) : (
    <div {...props}>{face}</div>
  );
}
