import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineRequest, waitForOnlineServer } from "./onlineApi";

const health = () => Response.json({ status: "ok", protocolVersion: "1" });

describe("connection to a sleeping server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("Timeout", "TimeoutError")),
        milliseconds,
      );
      return controller.signal;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("connects immediately when the health endpoint is ready", async () => {
    const fetch = vi.fn().mockResolvedValue(health());
    vi.stubGlobal("fetch", fetch);
    await waitForOnlineServer();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("http://localhost/api/health");
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
  });
  it("waits past the normal request timeout and retries only safe health GETs", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Starting", { status: 503 }))
      .mockImplementationOnce(
        (_url, options: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(options.signal?.reason),
            );
            setTimeout(() => resolve(new Response("Loading")), 30_000);
          }),
      )
      .mockResolvedValue(health());
    vi.stubGlobal("fetch", fetch);
    let ready = false;
    const waiting = waitForOnlineServer().then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(24_000);
    await waiting;
    expect(ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      fetch.mock.calls.every(
        ([url, options]) =>
          url.endsWith("/api/health") && !options.method && !options.body,
      ),
    ).toBe(true);
  });
  it("stops waiting after 90 seconds without creating a guest or table", async () => {
    const fetch = vi.fn(
      (_url, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(options.signal?.reason),
          );
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const waiting = expect(waitForOnlineServer()).rejects.toMatchObject({
      code: "SERVER_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await waiting;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels waking when the player leaves the connection screen", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("Starting", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const waiting = expect(
      waitForOnlineServer(controller.signal),
    ).rejects.toThrow("Cancelled");
    await vi.advanceTimersByTimeAsync(1);
    controller.abort(new Error("Cancelled"));
    await waiting;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry a wrong address or unsupported protocol", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("Missing", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await expect(waitForOnlineServer()).rejects.toMatchObject({
      code: "SERVER_UNAVAILABLE",
    });
    fetch.mockResolvedValue(
      Response.json({ status: "ok", protocolVersion: "999" }),
    );
    await expect(waitForOnlineServer()).rejects.toMatchObject({
      code: "PROTOCOL_ERROR",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("never retries a state-changing request after a server error", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: "SERVER_BUSY",
          message: "Попробуйте позже.",
        },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(onlineRequest("/api/guests", null, {})).rejects.toMatchObject({
      code: "SERVER_BUSY",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });
});
