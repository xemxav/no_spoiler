import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tweet } from "@no-spoiler/shared";
import { DEFAULT_BACKEND_URL } from "./config.js";

const TWEETS: Tweet[] = [{ id: "1", author: "alice", text: "Huge upset in the final." }];

async function loadBackground(
  fetchImpl: unknown,
  stored: Record<string, unknown> = { watchlist: ["Lakers vs Celtics 9/19"] },
) {
  vi.resetModules();
  const action = {
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
  };
  const state = { ...stored };
  vi.stubGlobal("chrome", {
    action,
    storage: {
      local: {
        get: (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in state) result[key] = state[key];
          }
          return Promise.resolve(result);
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(state, items);
          return Promise.resolve();
        },
      },
    },
    runtime: { onMessage: { addListener: () => undefined } },
  });
  vi.stubGlobal("fetch", fetchImpl);
  const { handleJudge } = await import("./background.js");
  return { handleJudge, action, state };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("backend-unreachable badge", () => {
  it("shows a badge when the request to /judge throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { handleJudge, action } = await loadBackground(
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );

    const result = await handleJudge(TWEETS);

    expect(result).toEqual({ error: true });
    expect(action.setBadgeText).toHaveBeenCalledTimes(1);
    const [badge] = action.setBadgeText.mock.calls[0];
    expect(badge.text).toBeTruthy();
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledTimes(1);
  });

  it("shows a badge when /judge responds with an error status", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { handleJudge, action } = await loadBackground(
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const result = await handleJudge(TWEETS);

    expect(result).toEqual({ error: true });
    expect(action.setBadgeText).toHaveBeenCalledTimes(1);
    const [badge] = action.setBadgeText.mock.calls[0];
    expect(badge.text).toBeTruthy();
  });

  it("clears the badge once a request succeeds again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: { "1": true } }) });
    const { handleJudge, action } = await loadBackground(fetchMock);

    await handleJudge(TWEETS);
    action.setBadgeText.mockClear();
    const result = await handleJudge(TWEETS);

    expect(result).toEqual({ results: { "1": true } });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });
});

describe("the backend address", () => {
  const ok = () =>
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: {} }) });

  it("posts to the address stored in settings", async () => {
    const fetchMock = ok();
    const { handleJudge } = await loadBackground(fetchMock, {
      watchlist: ["Lakers vs Celtics 9/19"],
      backendUrl: "https://engine.up.railway.app",
    });

    await handleJudge(TWEETS);

    expect(fetchMock.mock.calls[0][0]).toBe("https://engine.up.railway.app/judge");
  });

  it("falls back to the build-time default when none is stored", async () => {
    const fetchMock = ok();
    const { handleJudge } = await loadBackground(fetchMock);

    await handleJudge(TWEETS);

    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_BACKEND_URL}/judge`);
  });

  it("builds a single-slash path from an address that ends in one", async () => {
    const fetchMock = ok();
    const { handleJudge } = await loadBackground(fetchMock, {
      watchlist: ["Lakers vs Celtics 9/19"],
      backendUrl: "https://engine.up.railway.app/",
    });

    await handleJudge(TWEETS);

    expect(fetchMock.mock.calls[0][0]).toBe("https://engine.up.railway.app/judge");
  });

  it("reads it per request, so a change in the popup takes effect at once", async () => {
    const fetchMock = ok();
    const { handleJudge, state } = await loadBackground(fetchMock);

    await handleJudge(TWEETS);
    state.backendUrl = "https://engine.up.railway.app";
    await handleJudge(TWEETS);

    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_BACKEND_URL}/judge`);
    expect(fetchMock.mock.calls[1][0]).toBe("https://engine.up.railway.app/judge");
  });
});
