import type { CSSProperties } from "react";
import type { Card } from "../lib/types";
import { ranks, symbols, suitNames } from "../lib/types";
export default function PlayingCard({
  card,
  disabled = false,
  onClick,
  index = 0,
  total = 1,
}: {
  card: Card;
  disabled?: boolean;
  onClick?: () => void;
  index?: number;
  total?: number;
}) {
  const rank = ranks[card.rank],
    suit = symbols[card.suit],
    red = card.suit === "HEARTS" || card.suit === "DIAMONDS";
  const court = ["J", "Q", "K"].includes(rank);
  const face = (
    <>
      <span className="corner">
        {rank}
        <small>{suit}</small>
      </span>
      {court ? (
        <div className="court">
          <svg viewBox="0 0 48 85">
            <rect
              x="2"
              y="2"
              width="44"
              height="81"
              rx="1"
              stroke="#c5a45e"
              fill="#e9dcba"
            />
            <path
              d="m12 19-3-9 8 4 7-8 7 8 8-4-3 9z"
              fill="#c8a863"
              stroke="#806e49"
            />
            <path d="M16 21h16v15l-8 6-8-6z" fill="#e8cdaa" stroke="#ad8c65" />
            <path d="M18 28h2m8 0h2m-8 7h5" stroke="#324536" />
            <path
              d="m10 47 14-7 14 7 3 28H7z"
              fill={red ? "#a94942" : "#365b53"}
              stroke="#c2a163"
            />
            <path d="m24 42-9 16 9 18 9-18z" fill="#d4b270" />
            <path
              d="m7 72 34-21M7 61l34 15M14 45v35m20-35v35"
              stroke="#e6c792"
            />
          </svg>
        </div>
      ) : (
        <div className="card-center">
          {rank === "A" ? (
            suit
          ) : (
            <div className="pip-pattern">
              {Array.from({ length: Number(rank) }, (_, i) => (
                <span key={i}>{suit}</span>
              ))}
            </div>
          )}
        </div>
      )}
      <span className="corner bottom-corner">
        {rank}
        <small>{suit}</small>
      </span>
    </>
  );
  const props = {
    className: `playing-card ${red ? "red" : ""}`,
    style: {
      "--angle": (index - (total - 1) / 2) * 2,
      "--curve": Math.abs(index - (total - 1) / 2) * 2,
    } as CSSProperties,
    "aria-label": `${rank} ${suitNames[card.suit]}`,
  };
  return onClick ? (
    <button {...props} onClick={onClick} disabled={disabled}>
      {face}
    </button>
  ) : (
    <div {...props}>{face}</div>
  );
}
