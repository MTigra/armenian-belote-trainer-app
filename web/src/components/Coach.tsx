import { useEffect, useRef, useState } from "react";
import type { ChatMessage, PlayerView, Seat } from "../lib/types";
import { askTrainer } from "../lib/trainer";
import { names } from "../lib/types";
import Icon from "./Icon";
import Modal from "./Modal";
export default function Coach({
  view,
  actionIndex,
  messages,
  onMessage,
  onClose,
  code,
  onCode,
  online = false,
  labels = names,
}: {
  view: PlayerView;
  actionIndex: number;
  messages: ChatMessage[];
  onMessage: (m: ChatMessage) => void;
  onClose: () => void;
  code: string;
  onCode: (code: string) => void;
  online?: boolean;
  labels?: Record<Seat, string>;
}) {
  const [question, setQuestion] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [messages.length, error]);
  async function send(text = question) {
    if (!text.trim() || pending) return;
    if (!/^\d{4}$/.test(code)) {
      setError("Введите четырёхзначный код доступа к тренеру.");
      return;
    }
    setQuestion("");
    setError("");
    setPending(true);
    const moment = { deal: view.dealNumber, action: actionIndex };
    onMessage({
      id: crypto.randomUUID(),
      role: "user",
      text: text.trim(),
      moment,
      createdAt: Date.now(),
    });
    const c = new AbortController();
    controller.current = c;
    const timeout = setTimeout(() => c.abort(), 30000);
    try {
      const answer = await askTrainer(view, text.trim(), code, c.signal);
      onMessage({
        id: crypto.randomUUID(),
        role: "coach",
        text: answer.explanation,
        moment,
        createdAt: Date.now(),
      });
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Ответ не получен. Повторите запрос."
          : e instanceof Error
            ? e.message
            : "Не удалось обратиться к тренеру.",
      );
      setQuestion(text);
    } finally {
      clearTimeout(timeout);
      if (!c.signal.aborted || controller.current === c) setPending(false);
    }
  }
  return (
    <Modal
      title="Чат с тренером"
      onClose={onClose}
      className="coach-sheet react-coach"
    >
      <div className="sheet-grip" />
      <div className="coach-header">
        <span className="coach-logo">
          <Icon name="spark" />
        </span>
        <div>
          <h2>Тренер</h2>
          <p>Вопросы по текущей раздаче</p>
        </div>
      </div>
      <div className="coach-context">
        <Icon name="pause" />
        Раздача {view.dealNumber} ·{" "}
        {view.phase === "BIDDING" ? "торговля" : `ход: ${labels[view.turn]}`} ·
        {online ? "партия продолжается" : "партия на паузе"}
      </div>
      <div className="coach-messages" ref={list}>
        <p className="coach-status">
          Тренер использует внешний сервис. До подключения сервера ответы
          недоступны.
        </p>
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <small>
              Раздача {m.moment.deal} · действие {m.moment.action}
              {online &&
                (m.moment.deal !== view.dealNumber ||
                  m.moment.action !== actionIndex) &&
                " · прошлый момент"}
            </small>
            {m.text}
          </div>
        ))}
        {pending && <p role="status">Ожидаем ответ…</p>}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="trainer-access">
        <label htmlFor="coach-code">Код тренера</label>
        <input
          id="coach-code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={code}
          onChange={(e) => onCode(e.target.value.replace(/\D/g, ""))}
          placeholder="4 цифры"
        />
      </div>
      <div className="quick-prompts">
        {["Обсудить мой ход", "Как оценить руку?"].map((t) => (
          <button key={t} onClick={() => setQuestion(t)}>
            {t}
          </button>
        ))}
      </div>
      <form
        className="coach-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="Сообщение тренеру"
          maxLength={2000}
          placeholder="Спросите о своей игре…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          className="send-button"
          disabled={pending || !question.trim()}
          aria-label="Отправить сообщение"
        >
          <Icon name="arrow" />
        </button>
      </form>
    </Modal>
  );
}
