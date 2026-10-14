import type { Suit } from "../lib/types";
import { suitNames } from "../lib/types";
export default function SuitImage({ suit }: { suit: Suit }) {
  return (
    <img
      className="suit-image"
      src={`${import.meta.env.BASE_URL}cards/${suit}.svg`}
      alt={suitNames[suit]}
      draggable={false}
    />
  );
}
