import { useState } from "react";
import Icon from "./Icon";
export default function Connection({
  onBack,
  onTraining,
}: {
  onBack: () => void;
  onTraining: () => void;
}) {
  const [tab, setTab] = useState("open");
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
          <div className="join-tabs" aria-label="Способ подключения">
            {[
              ["open", "Открытые столы"],
              ["code", "По коду"],
              ["create", "Создать"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "open" ? (
            <div className="empty-state">
              <Icon name="players" />
              <p>Онлайн-столы пока недоступны.</p>
              <span>Сервер будет подключён на следующем этапе.</span>
            </div>
          ) : (
            <div className="connection-form">
              <label htmlFor="connection-input">
                {tab === "code" ? "Код стола" : "Название стола"}
              </label>
              <input
                id="connection-input"
                placeholder={tab === "code" ? "000000" : "Стол Арама"}
                maxLength={tab === "code" ? 6 : 32}
              />
              <button className="menu-primary" disabled>
                {tab === "code" ? "Подключиться" : "Создать стол"}
              </button>
            </div>
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
