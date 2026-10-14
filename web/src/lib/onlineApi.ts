import type { GuestIdentity, GuestStatus, TableSnapshot } from "./onlineTypes";
export class OnlineFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function serverOrigin(): string {
  try {
    const stored = localStorage.getItem("blot.serverOrigin");
    const configured = import.meta.env.VITE_API_URL;
    // Older Pages builds saved their static site as the API; move that default
    // to the deployed server while keeping explicitly selected API origins.
    if (
      configured &&
      typeof location !== "undefined" &&
      location.hostname.endsWith(".github.io") &&
      stored === location.origin
    )
      return configured;
    return (
      stored ||
      configured ||
      (typeof location === "undefined" ? "http://localhost" : location.origin)
    );
  } catch {
    return (
      import.meta.env.VITE_API_URL ||
      (typeof location === "undefined" ? "http://localhost" : location.origin)
    );
  }
}
export function configureOrigin(input: string): string {
  const url = new URL(input || location.origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Укажите адрес сервера: https://example.com, без пути и пароля.",
    );
  localStorage.setItem("blot.serverOrigin", url.origin);
  return url.origin;
}
export function storedGuest(): GuestIdentity | null {
  try {
    const value = JSON.parse(
      localStorage.getItem("blot.onlineGuest") || "null",
    );
    if (
      value?.origin === serverOrigin() &&
      typeof value.token === "string" &&
      typeof value.id === "string" &&
      typeof value.nickname === "string"
    )
      return value;
    return null;
  } catch {
    return null;
  }
}
export function rememberGuest(guest: GuestIdentity | null): void {
  if (!guest) {
    localStorage.removeItem("blot.onlineGuest");
    return;
  }
  localStorage.setItem("blot.onlineGuest", JSON.stringify(guest));
}
/** Wake a sleeping host with safe GETs before sending any state-changing request. */
export async function waitForOnlineServer(cancel?: AbortSignal): Promise<void> {
  const origin = serverOrigin();
  const timeout = AbortSignal.timeout(90_000);
  const signal = cancel ? AbortSignal.any([timeout, cancel]) : timeout;
  try {
    while (!signal.aborted) {
      const response = await fetch(`${origin}/api/health`, {
        signal,
        cache: "no-store",
      });
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("application/json")
      ) {
        const health = await response.json();
        if (
          health.status === "ok" &&
          ["1", "2"].includes(String(health.protocolVersion))
        )
          return;
        throw new OnlineFailure(
          "PROTOCOL_ERROR",
          "Сервер прислал неподдерживаемый ответ. Проверьте адрес сервера и обновите приложение.",
        );
      }
      if (![200, 502, 503, 504].includes(response.status)) break;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 2000);
        function abort() {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(signal.reason);
        }
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  } catch (error) {
    if (cancel?.aborted) throw cancel.reason;
    if (error instanceof OnlineFailure) throw error;
  }
  if (cancel?.aborted) throw cancel.reason;
  throw new OnlineFailure(
    "SERVER_UNAVAILABLE",
    "Не удалось дождаться сервера. Проверьте подключение и повторите попытку.",
  );
}
export async function onlineRequest<T>(
  path: string,
  guest: GuestIdentity | null,
  body?: unknown,
): Promise<T> {
  try {
    const response = await fetch(`${guest?.origin || serverOrigin()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(guest ? { Authorization: `Bearer ${guest.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new OnlineFailure(
        "SERVER_UNAVAILABLE",
        "Онлайн-сервер недоступен. Проверьте подключение и адрес сервера.",
      );
    const data = await response.json();
    if (!response.ok)
      throw new OnlineFailure(
        data.code || "REQUEST_FAILED",
        data.message || "Запрос не выполнен.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof OnlineFailure) throw error;
    throw new OnlineFailure(
      "SERVER_UNAVAILABLE",
      "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.",
    );
  }
}
export function preferredNickname(): string {
  try {
    return localStorage.getItem("blot.nickname") || "";
  } catch {
    return "";
  }
}
export function rememberNickname(value: string): void {
  localStorage.setItem("blot.nickname", value.trim());
}
export async function createGuest(nickname = ""): Promise<GuestIdentity> {
  const credentials = await onlineRequest<
    Omit<GuestIdentity, "origin" | "tableCode">
  >("/api/guests", null, nickname.trim() ? { nickname: nickname.trim() } : {});
  const guest = { ...credentials, origin: serverOrigin(), tableCode: null };
  rememberGuest(guest);
  return guest;
}
export const guestStatus = (guest: GuestIdentity) =>
  onlineRequest<GuestStatus>("/api/me", guest);
export const renameGuest = (guest: GuestIdentity, nickname: string) =>
  onlineRequest<GuestStatus>("/api/me", guest, { nickname });
export const createTable = (
  guest: GuestIdentity,
  name: string,
  timerSeconds: number | null,
) => onlineRequest<TableSnapshot>("/api/tables", guest, { name, timerSeconds });
export const joinTable = (guest: GuestIdentity, code: string) =>
  onlineRequest<TableSnapshot>(`/api/tables/${code}/join`, guest, {});
