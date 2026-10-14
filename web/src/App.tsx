import { useEffect, useState } from "react";
import type { ChatMessage, PlayerView, SavedMatch } from "./lib/types";
import { names } from "./lib/types";
import { useOfflineGame } from "./lib/useOfflineGame";
import { importMatch } from "./lib/transfer";
import Menu from "./components/Menu";
import Connection from "./components/Connection";
import Bidding from "./components/Bidding";
import Table from "./components/Table";
import Coach from "./components/Coach";
import History from "./components/History";
import Review from "./components/Review";
import Modal from "./components/Modal";
import Icon from "./components/Icon";
import Announcements from "./components/Announcements";
type Screen = "menu" | "game" | "join" | "history" | "review";
const screenFromHash = (): Screen => {
  const hash = location.hash.slice(1).replace(/-coach$/, "");
  return ["game", "join", "history", "review"].includes(hash)
    ? (hash as Screen)
    : "menu";
};
export default function App() {
  const [screen, setScreen] = useState<Screen>(screenFromHash),
    [modal, setModal] = useState<
      "game" | "replace" | "help" | "delete" | "declarations" | null
    >(null),
    [coach, setCoach] = useState<{
      view: PlayerView;
      cursor: number;
      review: boolean;
    } | null>(null),
    [review, setReview] = useState<SavedMatch | null>(null);
  const [trainerCode, setTrainerCode] = useState("");
  const [resumeCoach, setResumeCoach] = useState(
    () => location.hash === "#game-coach",
  );
  const game = useOfflineGame(
    screen === "game",
    modal !== null || coach !== null || resumeCoach,
  );
  useEffect(() => {
    if (resumeCoach && game.ready && game.view) {
      setCoach({
        view: game.view,
        cursor: game.state?.actions.length ?? 0,
        review: false,
      });
      setResumeCoach(false);
    } else if (resumeCoach && game.ready && !game.session)
      setResumeCoach(false);
  }, [resumeCoach, game.ready, game.view, game.state, game.session]);
  const bidding =
    game.view?.phase === "BIDDING" || game.view?.phase === "REDOUBLE";
  useEffect(() => {
    document.body.dataset.view =
      screen === "game" ? (bidding ? "bid" : "table") : screen;
  }, [screen, bidding]);
  useEffect(() => {
    if (game.ready && screen === "game" && !game.session) setScreen("menu");
    if (game.ready && screen === "review" && !review) setScreen("history");
  }, [game.ready, game.session, screen, review]);
  useEffect(() => {
    function pop() {
      setModal(null);
      setCoach(null);
      setScreen(screenFromHash());
    }
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function go(next: Screen) {
    setScreen(next);
    history.pushState({ screen: next }, "", `#${next}`);
    window.scrollTo(0, 0);
  }
  function closeCoach() {
    setCoach(null);
    if (history.state?.coach) history.back();
  }
  function openCoach(
    v = game.view,
    cursor = game.state?.actions.length ?? 0,
    isReview = false,
  ) {
    if (!v) return;
    setCoach({ view: v, cursor, review: isReview });
    history.pushState({ screen, coach: true }, "", `#${screen}-coach`);
  }
  function training() {
    if (game.session && game.state?.phase !== "MATCH_FINISHED")
      setModal("replace");
    else {
      game.start();
      go("game");
    }
  }
  function chatMessage(message: ChatMessage) {
    if (coach?.review && review) {
      const updated = { ...review, chat: [...review.chat, message] };
      setReview(updated);
      void game
        .addMatch(updated)
        .catch(() => game.setError("Не удалось сохранить диалог"));
    } else game.message(message);
  }
  async function importFile(text: string) {
    try {
      const match = importMatch(text);
      await game.addMatch(match);
      game.setError("");
      setReview(match);
      go("review");
    } catch (e) {
      game.setError(
        e instanceof Error ? e.message : "Не удалось импортировать файл",
      );
      throw e;
    }
  }
  const live =
    game.session && game.state?.phase !== "MATCH_FINISHED"
      ? game.session
      : null;
  const terminal =
    game.view &&
    ["DEAL_FINISHED", "MATCH_FINISHED", "REDEAL_REQUIRED"].includes(
      game.view.phase,
    );
  return (
    <div className="app-shell">
      <main>
        {game.error && (
          <div className="error-banner" role="alert">
            <span>{game.error}</span>
            <button
              className="icon-button"
              onClick={() => game.setError("")}
              aria-label="Скрыть сообщение"
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {!game.ready ? (
          <div className="loading-screen" role="status">
            Открываем локальную историю…
          </div>
        ) : (
          <>
            {screen === "menu" && (
              <Menu
                active={live}
                onContinue={() => go("game")}
                onTraining={training}
                onJoin={() => go("join")}
                onHistory={() => go("history")}
                onHelp={() => setModal("help")}
              />
            )}
            {screen === "join" && (
              <Connection onBack={() => go("menu")} onTraining={training} />
            )}
            {screen === "history" && (
              <History
                matches={game.matches}
                onBack={() => go("menu")}
                onReview={(m) => {
                  setReview(m);
                  go("review");
                }}
                onImport={importFile}
                onError={game.setError}
              />
            )}
            {screen === "review" && review && (
              <Review
                key={review.id}
                match={review}
                onBack={() => go("history")}
                onCoach={(v, c) => openCoach(v, c, true)}
                onDelete={() => setModal("delete")}
              />
            )}
            {screen === "game" &&
              game.view &&
              (bidding ? (
                <Bidding
                  view={game.view}
                  onAction={game.action}
                  onCoach={() => openCoach()}
                  onMenu={() => setModal("game")}
                />
              ) : (
                <Table
                  view={game.view}
                  onDeclarations={() => setModal("declarations")}
                  onPlay={(card) =>
                    game.action({ type: "play", seat: "SOUTH", card })
                  }
                  onCoach={() => openCoach()}
                  onMenu={() => setModal("game")}
                />
              ))}
          </>
        )}
        {game.ready && screen === "game" && game.view && terminal && (
          <Modal title="Результат раздачи" onClose={() => go("menu")}>
            <h2>
              {game.view.phase === "REDEAL_REQUIRED"
                ? "Все спасовали"
                : game.view.phase === "MATCH_FINISHED"
                  ? game.state?.winner === "NORTH_SOUTH"
                    ? "Ваша команда выиграла"
                    : "Победили соперники"
                  : "Раздача завершена"}
            </h2>
            {game.view.phase === "REDEAL_REQUIRED" ? (
              <p>Карты пересдаются следующему сдающему.</p>
            ) : (
              <>
                <p>
                  {game.state?.result?.contractSucceeded
                    ? "Контракт выполнен"
                    : "Контракт не выполнен"}
                </p>
                <div className="result-score">
                  {game.view.scores.northSouth}
                  <span>:</span>
                  {game.view.scores.eastWest}
                </div>
                <p>
                  За раздачу: {game.state?.result?.awarded.northSouth} :{" "}
                  {game.state?.result?.awarded.eastWest}
                </p>
              </>
            )}
            {game.view.phase === "MATCH_FINISHED" ? (
              <>
                <p>
                  {game.saving ||
                  !game.matches.some((m) => m.id === game.session?.id)
                    ? "Сохраняем запись…"
                    : "Матч сохранён в «Мои игры»."}
                </p>
                <button
                  className="menu-primary"
                  disabled={
                    game.saving ||
                    !game.matches.some((m) => m.id === game.session?.id)
                  }
                  onClick={() => go("menu")}
                >
                  В главное меню
                  <Icon name="arrow" />
                </button>
              </>
            ) : (
              <button className="menu-primary" onClick={game.next}>
                {game.view.phase === "REDEAL_REQUIRED"
                  ? "Пересдать"
                  : "Следующая раздача"}
                <Icon name="arrow" />
              </button>
            )}
          </Modal>
        )}
        {modal === "game" && (
          <Modal title="Меню партии" onClose={() => setModal(null)}>
            <h2>Меню партии</h2>
            <p>
              {game.saving
                ? "Сохраняем текущий ход…"
                : "Текущая партия сохраняется на устройстве."}
            </p>
            <label className="speed-setting">
              Темп ботов
              <select
                value={game.speed}
                onChange={(e) => game.changeSpeed(Number(e.target.value))}
              >
                <option value={1000}>Медленно</option>
                <option value={650}>Обычно</option>
                <option value={250}>Быстро</option>
              </select>
            </label>
            <button className="menu-secondary" onClick={() => setModal(null)}>
              Вернуться к столу
            </button>
            <button
              className="text-button"
              onClick={() => {
                setModal(null);
                go("menu");
              }}
            >
              Сохранить и выйти в меню
            </button>
          </Modal>
        )}
        {modal === "replace" && (
          <Modal title="Новая тренировка" onClose={() => setModal(null)}>
            <h2>Есть незавершённая партия</h2>
            <p>
              Новая тренировка заменит её сохранение. Завершённые матчи
              останутся в истории.
            </p>
            <button
              className="menu-primary"
              onClick={() => {
                setModal(null);
                go("game");
              }}
            >
              Продолжить партию
            </button>
            <button
              className="text-button"
              onClick={() => {
                setModal(null);
                game.start();
                go("game");
              }}
            >
              Заменить новой тренировкой
            </button>
          </Modal>
        )}
        {modal === "declarations" && game.view && (
          <Announcements view={game.view} onClose={() => setModal(null)} />
        )}
        {modal === "help" && (
          <Modal title="Об игре" onClose={() => setModal(null)}>
            <span className="brand-symbol">Բ</span>
            <h2>Базар блот</h2>
            <p>
              Четыре игрока, две команды. Партия до 301. Профиль правил:
              armenian-training-0.1.
            </p>
            <p>
              Офлайн-тренировка работает на общем движке. Боты совершают
              разрешённые действия. Онлайн-сервер и AI-тренер пока не
              подключены.
            </p>
          </Modal>
        )}
        {modal === "delete" && review && (
          <Modal title="Удалить запись" onClose={() => setModal(null)}>
            <h2>Удалить локальный матч?</h2>
            <p>Экспортируйте запись, если хотите сохранить копию.</p>
            <button
              className="menu-primary"
              onClick={() => {
                void game
                  .removeMatch(review.id)
                  .then(() => {
                    setReview(null);
                    setModal(null);
                    go("history");
                  })
                  .catch(() => game.setError("Не удалось удалить запись"));
              }}
            >
              Удалить
            </button>
            <button className="text-button" onClick={() => setModal(null)}>
              Отмена
            </button>
          </Modal>
        )}
        {coach && (
          <Coach
            view={coach.view}
            actionIndex={coach.cursor}
            messages={
              coach.review ? (review?.chat ?? []) : (game.session?.chat ?? [])
            }
            onMessage={chatMessage}
            onClose={closeCoach}
            code={trainerCode}
            onCode={setTrainerCode}
          />
        )}
        <div className="sr-only" aria-live="polite">
          {game.view?.phase === "PLAYING"
            ? `Ход: ${names[game.view.turn]}`
            : game.view?.phase === "BIDDING"
              ? `Торговля, слово ${names[game.view.auction.turn]}`
              : ""}
        </div>
      </main>
    </div>
  );
}
