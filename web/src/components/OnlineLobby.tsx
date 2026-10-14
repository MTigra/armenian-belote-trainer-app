import { useState } from "react";
import type { OnlineGameController } from "../lib/useOnlineGame";
import { SEATS } from "../lib/types";
import Icon from "./Icon";
const places = { SOUTH: "Юг", WEST: "Запад", NORTH: "Север", EAST: "Восток" };
export default function OnlineLobby({
  game,
  onBack,
}: {
  game: OnlineGameController;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const table = game.snapshot;
  if (!table) return null;
  const ready =
    table.members.length === 4 &&
    table.members.every((member) => member.connected);
  const host = game.guest?.id === table.hostId;
  const unavailable = game.pending || game.connection !== "connected";
  async function copy() {
    try {
      await navigator.clipboard.writeText(table!.code);
      setCopied(true);
    } catch {
      game.setError(
        "Не удалось скопировать. Передайте друзьям шесть цифр со стола.",
      );
    }
  }
  return (
    <section className="view active online-lobby">
      <button className="text-button" onClick={onBack}>
        <Icon name="back" />В главное меню
      </button>
      <div className="lobby-room">
        <h1>{table.name}</h1>
        <p>Пригласите ещё трёх игроков по коду</p>
        <div className="room-code">
          <strong aria-label="Код стола">{table.code}</strong>
          <button className="text-button" onClick={() => void copy()}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
        <p>
          Таймер хода:{" "}
          {table.timerSeconds === null
            ? "без ограничения"
            : `${table.timerSeconds} секунд`}
        </p>
        <div className="lobby-teams">
          {[
            ["SOUTH", "NORTH"],
            ["WEST", "EAST"],
          ].map((seats, index) => (
            <div key={index}>
              <h2>Команда {index + 1}</h2>
              {SEATS.filter((seat) => seats.includes(seat)).map((seat) => {
                const member = table.members.find(
                  (value) => value.seat === seat,
                );
                return (
                  <button
                    className={`lobby-place ${member?.id === game.guest?.id ? "your-place" : ""}`}
                    key={seat}
                    disabled={Boolean(member) || unavailable}
                    onClick={() => game.command("seat", undefined, seat)}
                  >
                    <span>{places[seat]}</span>
                    <strong>
                      {member
                        ? `${member.nickname}${member.id === game.guest?.id ? " · Вы" : ""}`
                        : "Свободно"}
                    </strong>
                    <small>
                      {member
                        ? member.connected
                          ? "На связи"
                          : "Ждём подключения"
                        : "Занять место"}
                    </small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {host ? (
          <button
            className="menu-primary"
            disabled={!ready || unavailable}
            onClick={() => game.command("start")}
          >
            Начать партию
          </button>
        ) : (
          <p role="status">Партию запускает создатель стола.</p>
        )}
        {!ready && (
          <p role="status">
            Подключено{" "}
            {table.members.filter((member) => member.connected).length} из 4
            игроков
          </p>
        )}
        <button
          className="text-button"
          disabled={unavailable}
          onClick={() => game.command("leave")}
        >
          Покинуть стол
        </button>
      </div>
    </section>
  );
}
