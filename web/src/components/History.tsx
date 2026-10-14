import { useRef, useState } from "react";
import type { SavedMatch } from "../lib/types";
import Icon from "./Icon";
export default function History({
  matches,
  onBack,
  onReview,
  onImport,
  onError,
}: {
  matches: SavedMatch[];
  onBack: () => void;
  onReview: (m: SavedMatch) => void;
  onImport: (text: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  async function read(file: File) {
    setImporting(true);
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Файл слишком большой (максимум 10 МБ)");
      await onImport(await file.text());
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    } finally {
      setImporting(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="view active">
      <div className="screen-heading">
        <button
          className="icon-button"
          onClick={onBack}
          aria-label="В главное меню"
        >
          <Icon name="back" />
        </button>
        <h1>Мои игры</h1>
        <button
          className="text-button import-button"
          disabled={importing}
          onClick={() => input.current?.click()}
        >
          <Icon name="upload" />
          {importing ? "Импорт…" : "Импорт"}
        </button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Импортировать матч"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f).catch(() => {});
          }}
        />
      </div>
      {matches.length === 0 ? (
        <div className="empty-state">
          <Icon name="history" />
          <p>Завершённых матчей пока нет.</p>
          <span>Они сохраняются здесь после окончания партии.</span>
        </div>
      ) : (
        <div>
          {matches.map((m) => (
            <button
              className="match-row"
              key={m.id}
              onClick={() => onReview(m)}
            >
              <span className="match-icon">
                <Icon name="cards" />
              </span>
              <span className="match-detail">
                <strong>
                  {new Date(m.finishedAt).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
                <small>Тренировка · {m.record.setups.length} сдач</small>
              </span>
              <span className="match-score">
                {m.scores.northSouth}
                <span>:</span>
                {m.scores.eastWest}
              </span>
              <span
                className={`match-result ${m.winner === "NORTH_SOUTH" ? "" : "loss"}`}
              >
                {m.winner === "NORTH_SOUTH" ? "Победа" : "Поражение"}
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
