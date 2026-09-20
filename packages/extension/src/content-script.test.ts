import { afterEach, describe, expect, it, vi } from "vitest";
import type { JudgeResponse } from "@no-spoiler/shared";

const BLUR_CLASS = "no-spoiler-blur";
const REVEAL_SELECTOR = ".no-spoiler-reveal";
const DEBOUNCE_MS = 300;

// Approximates current X/Twitter tweet markup, same shape as extract-tweet.test.ts.
function tweetHtml(id: string, author: string, text: string): string {
  return `
    <article data-testid="tweet" id="article-${id}">
      <div data-testid="User-Name">
        <a href="/${author}/status/${id}" role="link">
          <time datetime="2026-09-20T12:00:00.000Z">2h</time>
        </a>
      </div>
      <div data-testid="tweetText"><span>${text}</span></div>
    </article>
  `;
}

// Approximates a promoted tweet: no status permalink, so extractTweet returns null.
const PROMOTED_HTML = `
  <article data-testid="tweet" id="article-promoted">
    <div data-testid="User-Name"><span>Promoted</span></div>
    <div data-testid="tweetText"><span>Buy now, limited offer!</span></div>
  </article>
`;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loads a fresh content-script module instance against a fresh <body>, so the
 * observer from a previous test can't see the nodes this one appends.
 */
async function setupPage(sendMessage: (message: unknown) => Promise<unknown>): Promise<void> {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
  vi.resetModules();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: () => Promise.resolve({ watchlist: ["Lakers vs Celtics 9/19"] }),
        set: () => Promise.resolve(),
      },
      onChanged: { addListener: () => undefined },
    },
    runtime: { sendMessage },
  });
  await import("./content-script.js");
  await wait(0);
}

function appendTweets(...html: string[]): void {
  const container = document.createElement("div");
  container.innerHTML = html.join("");
  for (const child of [...container.children]) {
    document.body.appendChild(child);
  }
}

/** Lets the observer fire, the debounce elapse, and the response be applied. */
async function settle(): Promise<void> {
  await wait(0);
  await wait(DEBOUNCE_MS + 50);
  await wait(0);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fail open", () => {
  it("renders the batch unblurred when the backend reports an error", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ error: true });
    await setupPage(sendMessage);

    appendTweets(tweetHtml("1001", "alice", "Huge upset in the final."));
    await settle();

    const article = document.getElementById("article-1001");
    expect(article?.classList.contains(BLUR_CLASS)).toBe(false);
    expect(article?.querySelector(REVEAL_SELECTOR)).toBeNull();
  });

  it("renders the batch unblurred when the judge message itself rejects", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sendMessage = vi.fn().mockRejectedValue(new Error("service worker asleep"));
    await setupPage(sendMessage);

    appendTweets(tweetHtml("1002", "alice", "Another one."));
    await settle();

    const article = document.getElementById("article-1002");
    expect(article?.classList.contains(BLUR_CLASS)).toBe(false);
    expect(article?.querySelector(REVEAL_SELECTOR)).toBeNull();
  });
});

describe("judged-tweet cache", () => {
  it("re-renders a reappearing tweet from cache instead of judging it again", async () => {
    const response: JudgeResponse = { results: { "2002": true } };
    const sendMessage = vi.fn().mockResolvedValue(response);
    await setupPage(sendMessage);

    appendTweets(tweetHtml("2002", "bob", "Spoiler-y take."));
    await settle();

    const first = document.getElementById("article-2002");
    expect(first?.classList.contains(BLUR_CLASS)).toBe(true);
    expect(first?.querySelector(REVEAL_SELECTOR)).not.toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // X recycles timeline nodes on rescroll: same tweet id, brand new element.
    first?.remove();
    appendTweets(tweetHtml("2002", "bob", "Spoiler-y take."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const second = document.getElementById("article-2002");
    expect(second).not.toBe(first);
    expect(second?.classList.contains(BLUR_CLASS)).toBe(true);
    expect(second?.querySelector(REVEAL_SELECTOR)).not.toBeNull();
  });

  it("re-renders a reappearing non-spoiler tweet unblurred without judging it again", async () => {
    const response: JudgeResponse = { results: { "2003": false } };
    const sendMessage = vi.fn().mockResolvedValue(response);
    await setupPage(sendMessage);

    appendTweets(tweetHtml("2003", "bob", "Unrelated chatter."));
    await settle();
    document.getElementById("article-2003")?.remove();
    appendTweets(tweetHtml("2003", "bob", "Unrelated chatter."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const second = document.getElementById("article-2003");
    expect(second?.classList.contains(BLUR_CLASS)).toBe(false);
    expect(second?.querySelector(REVEAL_SELECTOR)).toBeNull();
  });

  it("judges a tweet again when the first attempt failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ error: true })
      .mockResolvedValueOnce({ results: { "2004": true } });
    await setupPage(sendMessage);

    appendTweets(tweetHtml("2004", "bob", "Retry me."));
    await settle();
    document.getElementById("article-2004")?.remove();
    appendTweets(tweetHtml("2004", "bob", "Retry me."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(document.getElementById("article-2004")?.classList.contains(BLUR_CLASS)).toBe(true);
  });
});

describe("malformed tweet markup", () => {
  it("never sends unparseable tweets to the backend and stays silent about them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response: JudgeResponse = { results: { "3003": false } };
    const sendMessage = vi.fn().mockResolvedValue(response);
    await setupPage(sendMessage);

    appendTweets(PROMOTED_HTML, tweetHtml("3003", "carol", "A normal tweet."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "judge",
      tweets: [{ id: "3003", author: "carol", text: "A normal tweet." }],
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("leaves an unparseable tweet rendered normally", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response: JudgeResponse = { results: {} };
    const sendMessage = vi.fn().mockResolvedValue(response);
    await setupPage(sendMessage);

    appendTweets(PROMOTED_HTML);
    await settle();

    expect(sendMessage).not.toHaveBeenCalled();
    const promoted = document.getElementById("article-promoted");
    expect(promoted?.classList.contains(BLUR_CLASS)).toBe(false);
    expect(promoted?.querySelector(REVEAL_SELECTOR)).toBeNull();
  });
});
