import type {
  ConnectionState,
  GuestIdentity,
  OnlineCommand,
  OnlineMessage,
} from "./onlineTypes";
interface SocketObserver {
  message: (value: OnlineMessage) => void;
  connection: (state: ConnectionState) => void;
}
interface SocketLife {
  socket: WebSocket | null;
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
  attempts: number;
}
/** No optimistic game state or queued moves: every reconnect starts with a fresh server projection. */
export class OnlineSocket {
  private readonly life: SocketLife = {
    socket: null,
    timer: null,
    stopped: false,
    attempts: 0,
  };
  constructor(
    private readonly config: {
      guest: GuestIdentity;
      code: string;
      observer: SocketObserver;
    },
  ) {}
  open(): void {
    if (this.life.stopped) return;
    this.config.observer.connection(
      this.life.attempts ? "reconnecting" : "connecting",
    );
    const url = new URL(
      `/api/tables/${this.config.code}/ws`,
      this.config.guest.origin,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    this.life.socket = socket;
    socket.onopen = () =>
      socket.send(
        JSON.stringify({ type: "auth", token: this.config.guest.token }),
      );
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => this.retry();
  }
  send(command: OnlineCommand): void {
    const socket = this.life.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.life.stopped)
      throw new Error(
        "Нет соединения с сервером. Дождитесь восстановления связи.",
      );
    socket.send(JSON.stringify(command));
  }
  close(): void {
    this.life.stopped = true;
    if (this.life.timer) clearTimeout(this.life.timer);
    this.life.socket?.close();
  }
  private receive(data: unknown): void {
    try {
      const message = JSON.parse(String(data)) as OnlineMessage;
      if (![1, 2].includes(message.protocolVersion))
        throw new Error("Обновите приложение: версия сервера изменилась.");
      if (message.type === "state") {
        this.life.attempts = 0;
        this.config.observer.connection("connected");
      }
      this.config.observer.message(message);
      if (
        message.type === "finished" ||
        message.type === "left" ||
        ["SESSION_EXPIRED", "TABLE_GONE", "NOT_MEMBER"].includes(
          message.error?.code || "",
        )
      )
        this.close();
    } catch {
      this.config.observer.message({
        type: "error",
        protocolVersion: 1,
        snapshot: null,
        requestId: null,
        match: null,
        error: {
          code: "PROTOCOL_ERROR",
          message: "Неподдерживаемый ответ сервера. Обновите приложение.",
        },
      });
      this.config.observer.connection("ended");
      this.close();
    }
  }
  private retry(): void {
    if (this.life.stopped) return;
    this.config.observer.connection("reconnecting");
    const delay = Math.min(10_000, 500 * 2 ** this.life.attempts++);
    this.life.timer = setTimeout(() => this.open(), delay);
  }
}
