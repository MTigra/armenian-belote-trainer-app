import type { SavedMatch, Session } from "./types";
import { validateSession } from "./engine";
let dbPromise: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open("blot-local", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("active");
        r.result.createObjectStore("matches", { keyPath: "id" });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => {
        dbPromise = undefined;
        reject(r.error);
      };
    });
  return dbPromise;
}
async function write(
  stores: string[],
  operation: (t: IDBTransaction) => void,
): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const t = database.transaction(stores, "readwrite");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("Сохранение отменено"));
    operation(t);
  });
}
export async function loadActive(): Promise<Session | null> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const r = database
      .transaction("active")
      .objectStore("active")
      .get("session");
    r.onsuccess = () => {
      try {
        resolve(r.result ? validateSession(r.result) : null);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
export const saveActive = (session: Session) =>
  write(["active"], (t) => {
    t.objectStore("active").put(session, "session");
  });
export const finishSession = (match: SavedMatch) =>
  write(["active", "matches"], (t) => {
    t.objectStore("matches").put(match);
    t.objectStore("active").delete("session");
  });
export const putMatch = (match: SavedMatch) =>
  write(["matches"], (t) => {
    t.objectStore("matches").put(match);
  });
export const deleteMatch = (id: string) =>
  write(["matches"], (t) => {
    t.objectStore("matches").delete(id);
  });
export const clearActive = () =>
  write(["active"], (t) => {
    t.objectStore("active").delete("session");
  });
export async function loadMatches(): Promise<SavedMatch[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const r = database.transaction("matches").objectStore("matches").getAll();
    r.onsuccess = () =>
      resolve(
        (r.result as SavedMatch[]).sort((a, b) => b.finishedAt - a.finishedAt),
      );
    r.onerror = () => reject(r.error);
  });
}
export function preference(name: string, fallback: string): string {
  try {
    return localStorage.getItem(`blot.${name}`) ?? fallback;
  } catch {
    return fallback;
  }
}
export function setPreference(name: string, value: string): void {
  try {
    localStorage.setItem(`blot.${name}`, value);
  } catch {
    /* Preferences must not block gameplay. */
  }
}

/** Online dialogue uses a separate key and never replaces the offline snapshot. */
export async function loadOnlineChat(
  id: string,
): Promise<import("./types").ChatMessage[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("active")
      .objectStore("active")
      .get(`online-chat:${id}`);
    request.onsuccess = () => resolve(request.result?.chat ?? []);
    request.onerror = () => reject(request.error);
  });
}
export const saveOnlineChat = (
  id: string,
  chat: import("./types").ChatMessage[],
) =>
  write(["active"], (transaction) => {
    transaction.objectStore("active").put({ chat }, `online-chat:${id}`);
  });
export const finishOnlineMatch = (match: SavedMatch) =>
  write(["active", "matches"], (transaction) => {
    transaction.objectStore("matches").put(match);
    transaction.objectStore("active").delete(`online-chat:${match.id}`);
  });
