import { afterEach, describe, expect, it, vi } from "vitest";
import { serverOrigin, storedGuest } from "./onlineApi";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("published API origin", () => {
  const render = "https://armenian-blot.onrender.com";
  const pages = "https://mtigra.github.io";
  function settings(origin: string, stored: string, guestOrigin: string) {
    vi.stubGlobal("location", new URL(origin));
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "blot.serverOrigin"
          ? stored
          : JSON.stringify({
              origin: guestOrigin,
              id: "guest",
              nickname: "Гость",
              token: "scoped-token",
            }),
    });
  }
  it("migrates the previous Pages default without forwarding its guest token", () => {
    vi.stubEnv("VITE_API_URL", render);
    settings(pages, pages, pages);
    expect(serverOrigin()).toBe(render);
    expect(storedGuest()).toBeNull();
  });
  it("keeps an explicitly selected server and its scoped guest identity", () => {
    vi.stubEnv("VITE_API_URL", render);
    settings(pages, "https://my-server.example", "https://my-server.example");
    expect(serverOrigin()).toBe("https://my-server.example");
    expect(storedGuest()?.origin).toBe("https://my-server.example");
  });
  it("uses its own origin for a client bundled with Ktor", () => {
    vi.stubEnv("VITE_API_URL", "");
    settings(render, render, render);
    expect(serverOrigin()).toBe(render);
    expect(storedGuest()?.origin).toBe(render);
  });
});
