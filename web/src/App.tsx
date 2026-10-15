import { useEffect, useRef, useState } from "react";
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
import OnlineGame from "./components/OnlineGame";
import { useOnlineGame } from "./lib/useOnlineGame";
import { playerNames } from "./lib/presentation";
import { useResultReady } from "./lib/useResultReady";
type Screen = "menu" | "game" | "online" | "join" | "history" | "review";
const screenFromHash = (): Screen => {
  const hash = location.hash.slice(1).replace(/-coach$/, "");
  return ["game", "online", "join", "history", "review"].includes(hash)
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
      online?: boolean;
      full?: boolean;
    } | null>(null),
    [review, setReview] = useState<SavedMatch | null>(null);
  const currentReview = useRef(review);
  currentReview.current = review;
  const [trainerCode, setTrainerCode] = useState("");
  const [resumeCoach, setResumeCoach] = useState(
    () => location.hash === "#game-coach",
  );
  const game = useOfflineGame(
    screen === "game",
    modal !== null || coach !== null || resumeCoach,
  );
  const online = useOnlineGame(game.addMatch);
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
      screen === "game"
        ? bidding
          ? "bid"
          : "table"
        : screen === "online"
          ? online.snapshot?.view?.phase === "BIDDING" ||
            online.snapshot?.view?.phase === "REDOUBLE"
            ? "bid"
            : "table"
          : screen;
  }, [screen, bidding, online.snapshot?.view?.phase]);
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
    isOnline = false,
    full = false,
  ) {
    if (!v) return;
    setCoach({ view: v, cursor, review: isReview, online: isOnline, full });
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
    if (coach?.online) {
      online.message(message);
      return;
    }
    if (coach?.review && currentReview.current) {
      const latest = currentReview.current;
      const updated = { ...latest, chat: [...latest.chat, message] };
      currentReview.current = updated;
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
  const resultReady = useResultReady(game.view?.phase, game.view?.dealNumber);
  return (
    <div className="app-shell">
      <main>
        {(screen === "online" || screen === "join") && online.error && (
          <div className="error-banner" role="alert">
            <span>{online.error}</span>
            <button
              className="icon-button"
              onClick={() => online.setError("")}
              aria-label="Скрыть сообщение"
            >
              <Icon name="close" />
            </button>
          </div>
        )}
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
                onlineActive={
                  Boolean(
                    online.snapshot && online.snapshot.status !== "FINISHED",
                  ) || Boolean(online.guest?.tableCode)
                }
                onOnlineContinue={() => go("online")}
                nickname={online.guest?.nickname}
              />
            )}
            {screen === "join" && (
              <Connection
                game={online}
                onBack={() => go("menu")}
                onTraining={training}
                onEntered={() => go("online")}
              />
            )}
            {screen === "online" && (
              <OnlineGame
                coachOpen={Boolean(coach?.online)}
                game={online}
                onBack={() => go("menu")}
                onCoach={(view, cursor) => openCoach(view, cursor, false, true)}
              />
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
                onCoach={(v, c, full) => openCoach(v, c, true, false, full)}
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
                  overlaid={Boolean(coach) || modal !== null}
                  view={game.view}
                  onDeclarations={() => setModal("declarations")}
                  onDeclarationChoice={(show) =>
                    game.action({
                      type: show ? "declare" : "decline-declarations",
                      seat: "SOUTH",
                    })
                  }
                  onPlay={(card) =>
                    game.action({ type: "play", seat: "SOUTH", card })
                  }
                  onCoach={() => openCoach()}
                  onMenu={() => setModal("game")}
                />
              ))}
          </>
        )}
        {game.ready &&
          screen === "game" &&
          game.view &&
          terminal &&
          resultReady && (
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
              armenian-training-0.2.
            </p>
            <p>
              Офлайн-тренировка работает на общем движке. Боты совершают
              разрешённые действия. Онлайн-партии работают через Ktor-сервер.
              AI-тренер требует подключения к серверу и кода доступа.
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
        {coach &&
          (coach.online
            ? online.snapshot
            : coach.review
              ? review
              : game.session) && (
            <Coach
              matchId={
                coach.online
                  ? online.snapshot!.id
                  : coach.review
                    ? review!.id
                    : game.session!.id
              }
              token={coach.online ? online.guest?.token : undefined}
              source={
                coach.online
                  ? {
                      kind: "online",
                      tableCode: online.snapshot!.code,
                      expectedRevision: online.snapshot!.revision,
                    }
                  : coach.review
                    ? {
                        kind: "review",
                        localMatchId: review!.id,
                        perspective: coach.full ? "all_hands" : "player",
                        seat: coach.view.seat,
                        dealNumber: coach.view.dealNumber,
                        actionIndex: coach.cursor,
                        record: review!.record,
                      }
                    : {
                        kind: "offline",
                        localMatchId: game.session!.id,
                        actionIndex: coach.cursor,
                        view: coach.view,
                      }
              }
              view={
                coach.online
                  ? (online.snapshot?.view ?? coach.view)
                  : coach.view
              }
              actionIndex={
                coach.online
                  ? (online.snapshot?.actionCount ?? coach.cursor)
                  : coach.cursor
              }
              messages={
                coach.online
                  ? online.chat
                  : coach.review
                    ? (review?.chat ?? [])
                    : (game.session?.chat ?? [])
              }
              onMessage={chatMessage}
              onClose={closeCoach}
              code={trainerCode}
              onCode={setTrainerCode}
              online={Boolean(coach.online)}
              labels={
                coach.online && online.snapshot
                  ? playerNames(online.snapshot, false)
                  : review && coach.review
                    ? review.players
                    : undefined
              }
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
