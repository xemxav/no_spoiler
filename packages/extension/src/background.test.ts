import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tweet } from "@no-spoiler/shared";

const TWEETS: Tweet[] = [{ id: "1", author: "alice", text: "Huge upset in the final." }];

async function loadBackground(fetchImpl: unknown) {
  vi.resetModules();
  const action = {
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal("chrome", {
    action,
    storage: {
      local: {
        get: () => Promise.resolve({ watchlist: ["Lakers vs Celtics 9/19"] }),
        set: () => Promise.resolve(),
      },
    },
    runtime: { onMessage: { addListener: () => undefined } },
  });
  vi.stubGlobal("fetch", fetchImpl);
  const { handleJudge } = await import("./background.js");
  return { handleJudge, action };
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
