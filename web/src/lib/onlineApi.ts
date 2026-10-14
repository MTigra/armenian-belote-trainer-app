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
    return (
      localStorage.getItem("blot.serverOrigin") ||
      import.meta.env.VITE_API_URL ||
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
export async function createGuest(): Promise<GuestIdentity> {
  const credentials = await onlineRequest<
    Omit<GuestIdentity, "origin" | "tableCode">
  >("/api/guests", null, {});
  const guest = { ...credentials, origin: serverOrigin(), tableCode: null };
  rememberGuest(guest);
  return guest;
}
export const guestStatus = (guest: GuestIdentity) =>
  onlineRequest<GuestStatus>("/api/me", guest);
export const createTable = (
  guest: GuestIdentity,
  name: string,
  timerSeconds: number | null,
) => onlineRequest<TableSnapshot>("/api/tables", guest, { name, timerSeconds });
export const joinTable = (guest: GuestIdentity, code: string) =>
  onlineRequest<TableSnapshot>(`/api/tables/${code}/join`, guest, {});
