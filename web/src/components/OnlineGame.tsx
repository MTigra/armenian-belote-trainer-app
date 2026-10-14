import { useState, useEffect } from "react";
import { downloadMatch } from "../lib/transfer";
import type { ChatMessage, PlayerView } from "../lib/types";
import type { OnlineGameController } from "../lib/useOnlineGame";
import {
  actualAction,
  ownTotals,
  playerNames,
  playerPresence,
  presentView,
} from "../lib/presentation";
import Table from "./Table";
import Bidding from "./Bidding";
import Modal from "./Modal";
import Announcements from "./Announcements";
import OnlineStatus from "./OnlineStatus";
import OnlineLobby from "./OnlineLobby";
export default function OnlineGame({
  game,
  onBack,
  onCoach,
}: {
  game: OnlineGameController;
  onBack: () => void;
  onCoach: (view: PlayerView, cursor: number) => void;
}) {
  const [menu, setMenu] = useState(false),
    [declarations, setDeclarations] = useState(false);
  const snapshot = game.snapshot;
  const [exported, setExported] = useState(false);
  useEffect(() => setExported(false), [snapshot?.id]);
  if (!snapshot)
    return (
      <section className="empty-state">
        <p>
          {game.connection === "connecting" ||
          game.connection === "reconnecting"
            ? "Возвращаемся за стол…"
            : "Нет активного онлайн-стола."}
        </p>
        <button className="menu-secondary" onClick={onBack}>
          В главное меню
        </button>
      </section>
    );
  if (snapshot.status === "LOBBY")
    return <OnlineLobby game={game} onBack={onBack} />;
  if (!snapshot.view) return null;
  const view = presentView(snapshot.view),
    labels = playerNames(snapshot);
  if (game.connection !== "connected" || game.pending)
    view.options = {
      ...view.options,
      cards: [],
      minimumBid: null,
      mayPass: false,
      mayDouble: false,
      mayRedouble: false,
      mayDeclineRedouble: false,
    };
  const status = <OnlineStatus game={game} />;
  const terminal = [
    "REDEAL_REQUIRED",
    "DEAL_FINISHED",
    "MATCH_FINISHED",
  ].includes(view.phase);
  const score = ownTotals(view.scores, "SOUTH");
  const winner =
    snapshot.winner &&
    (snapshot.selfSeat === "SOUTH" || snapshot.selfSeat === "NORTH"
      ? snapshot.winner === "NORTH_SOUTH"
      : snapshot.winner === "EAST_WEST");
  return (
    <>
      {view.phase === "BIDDING" || view.phase === "REDOUBLE" ? (
        <Bidding
          view={view}
          labels={labels}
          presence={playerPresence(snapshot)}
          status={status}
          onMenu={() => setMenu(true)}
          onCoach={() => onCoach(snapshot.view!, snapshot.actionCount)}
          onAction={(action) =>
            game.command("action", actualAction(action, snapshot.selfSeat))
          }
        />
      ) : (
        <Table
          view={view}
          labels={labels}
          presence={playerPresence(snapshot)}
          online
          status={status}
          onMenu={() => setMenu(true)}
          onCoach={() => onCoach(snapshot.view!, snapshot.actionCount)}
          onDeclarations={() => setDeclarations(true)}
          onPlay={(card) =>
            game.command("action", {
              type: "play",
              seat: snapshot.selfSeat,
              card,
            })
          }
        />
      )}
      {menu && (
        <Modal title="Меню онлайн-партии" onClose={() => setMenu(false)}>
          <h2>Онлайн-партия</h2>
          <p>
            Стол {snapshot.code}. Игра продолжается, пока открыто меню или чат.
          </p>
          <p>
            Если связь прервётся, место останется за вами. Через две минуты
            подключится бот; таймер хода продолжает действовать.
          </p>
          <button className="menu-secondary" onClick={() => setMenu(false)}>
            Вернуться к столу
          </button>
          <button
            className="text-button"
            onClick={() => {
              setMenu(false);
              onBack();
            }}
          >
            В главное меню
          </button>
        </Modal>
      )}
      {declarations && (
        <Announcements
          view={view}
          labels={labels}
          onClose={() => setDeclarations(false)}
        />
      )}
      {terminal && (
        <Modal title="Результат онлайн-раздачи" onClose={onBack}>
          <h2>
            {view.phase === "MATCH_FINISHED"
              ? winner
                ? "Ваша команда выиграла"
                : "Победили соперники"
              : view.phase === "REDEAL_REQUIRED"
                ? "Все спасовали"
                : "Раздача завершена"}
          </h2>
          <div className="result-score">
            {score.northSouth}
            <span>:</span>
            {score.eastWest}
          </div>
          {snapshot.result && (
            <p>
              {snapshot.result.contractSucceeded
                ? "Контракт выполнен"
                : "Контракт не выполнен"}
            </p>
          )}
          {view.phase === "MATCH_FINISHED" ? (
            <>
              <p>
                {game.saving
                  ? "Сохраняем запись…"
                  : game.saved
                    ? "Матч сохранён в «Мои игры»."
                    : "Запись не сохранена. Повторите сохранение или скачайте её."}
              </p>
              {!game.saved && !game.saving && game.completedMatch && (
                <>
                  <button
                    className="menu-secondary"
                    onClick={() => void game.retrySave()}
                  >
                    Повторить сохранение
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (game.completedMatch) {
                        downloadMatch(game.completedMatch);
                        setExported(true);
                      }
                    }}
                  >
                    Скачать запись
                  </button>
                </>
              )}
              <button
                className="menu-primary"
                disabled={game.saving || (!game.saved && !exported)}
                onClick={() => {
                  game.clearFinished();
                  onBack();
                }}
              >
                В главное меню
              </button>
            </>
          ) : (
            <button
              className="menu-primary"
              disabled={game.pending || game.connection !== "connected"}
              onClick={() => game.command("advance")}
            >
              {view.phase === "REDEAL_REQUIRED"
                ? "Пересдать"
                : "Следующая раздача"}
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
