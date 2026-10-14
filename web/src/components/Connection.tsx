import { useState } from "react";
import type { OnlineGameController } from "../lib/useOnlineGame";
import { configureOrigin, serverOrigin } from "../lib/onlineApi";
import Icon from "./Icon";
export default function Connection({
  onBack,
  onTraining,
  onEntered,
  game,
}: {
  onBack: () => void;
  onTraining: () => void;
  onEntered: () => void;
  game: OnlineGameController;
}) {
  const [tab, setTab] = useState<"code" | "create">("code"),
    [code, setCode] = useState(""),
    [name, setName] = useState("Базар блот"),
    [timer, setTimer] = useState("60"),
    [address, setAddress] = useState(serverOrigin);
  async function connect() {
    try {
      configureOrigin(address);
    } catch (error) {
      game.setError(
        error instanceof Error ? error.message : "Некорректный адрес.",
      );
      return;
    }
    const entered =
      tab === "code"
        ? await game.join(code)
        : await game.create(name, timer === "none" ? null : Number(timer));
    if (entered) onEntered();
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
        <h1>Подключиться к игре</h1>
      </div>
      <div className="connection-layout">
        <div className="connection-main">
          {game.snapshot && game.snapshot.status !== "FINISHED" ? (
            <>
              <p>Вы уже за столом {game.snapshot.code}.</p>
              <button className="menu-primary" onClick={onEntered}>
                Вернуться за стол
              </button>
            </>
          ) : (
            <>
              <div className="join-tabs" aria-label="Способ подключения">
                {[
                  ["code", "По коду"],
                  ["create", "Создать"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key as "code" | "create")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form
                className="connection-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void connect();
                }}
              >
                {tab === "code" ? (
                  <label>
                    Код стола
                    <input
                      aria-label="Код стола"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000"
                      required
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      Название стола
                      <input
                        aria-label="Название стола"
                        maxLength={32}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Таймер хода
                      <select
                        aria-label="Таймер хода"
                        value={timer}
                        onChange={(event) => setTimer(event.target.value)}
                      >
                        <option value="none">Без ограничения</option>
                        <option value="30">30 секунд</option>
                        <option value="60">60 секунд</option>
                        <option value="120">120 секунд</option>
                      </select>
                    </label>
                  </>
                )}
                <button className="menu-primary" disabled={game.busy}>
                  {game.busy
                    ? "Подключаем…"
                    : tab === "code"
                      ? "Подключиться"
                      : "Создать стол"}
                </button>
              </form>
              <details className="server-settings">
                <summary>Настройки подключения</summary>
                <label>
                  Адрес сервера
                  <input
                    aria-label="Адрес сервера"
                    type="url"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </label>
              </details>
              <p className="connection-note">
                Вход как гость. Ник и доступ к месту сохраняются на этом
                устройстве.
              </p>
            </>
          )}
          <button className="menu-secondary" onClick={onTraining}>
            Тренировка с ботами
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </section>
  );
}
