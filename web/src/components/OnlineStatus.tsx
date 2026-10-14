import { useEffect, useState } from "react";
import type { OnlineGameController } from "../lib/useOnlineGame";
export default function OnlineStatus({ game }: { game: OnlineGameController }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const table = game.snapshot;
  if (!table) return null;
  const deadlines = Object.values(table.deadlines).filter(
    (value): value is number => typeof value === "number",
  );
  const remaining = deadlines.length
    ? Math.max(
        0,
        Math.ceil((Math.min(...deadlines) - now - game.clockOffset) / 1000),
      )
    : null;
  return (
    <span role="status">
      Стол {table.code} ·{" "}
      {game.connection === "connected"
        ? remaining === null
          ? "На связи"
          : `${remaining} с`
        : game.connection === "ended"
          ? "Завершено"
          : "Восстанавливаем связь…"}
    </span>
  );
}
