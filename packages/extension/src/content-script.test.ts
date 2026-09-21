import { afterEach, describe, expect, it, vi } from "vitest";
import type { JudgeResponse } from "@no-spoiler/shared";

const SHIELD_SELECTOR = ".no-spoiler-shield";
const REVEAL_SELECTOR = ".no-spoiler-reveal";
const PENDING_SELECTOR = ".no-spoiler-pending";
const BADGE_SELECTOR = ".no-spoiler-badge";
const LEGACY_BLUR_CLASS = "no-spoiler-blur";
const DEBOUNCE_MS = 300;

// X's own article classes. React rewrites this attribute wholesale from its
// props whenever it re-renders the article (hover, like/reply state, ...).
const X_ARTICLE_CLASSES = "css-175oi2r r-18u37iz r-1udh08x r-1c4vpko";

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

/**
 * Deliberately mechanism-agnostic: a spoiler counts as hidden whether the
 * extension marks the article itself or covers it. The re-render tests below
 * are about the behaviour surviving, not about which mechanism achieves it.
 */
function isHidden(article: Element): boolean {
  return (
    article.classList.contains(LEGACY_BLUR_CLASS) || article.querySelector(SHIELD_SELECTOR) !== null
  );
}

function requireArticle(id: string): HTMLElement {
  const article = document.getElementById(`article-${id}`);
  if (!article) throw new Error(`fixture missing article ${id}`);
  return article;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loads a fresh content-script module instance against a fresh <body>, so the
 * observer from a previous test can't see the nodes this one appends.
 */
async function setupPage(sendMessage: (message: unknown) => Promise<unknown>): Promise<void> {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
  document.head.innerHTML = "";
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

/**
 * A judge response the test settles by hand, so it can look at the page while
 * a verdict is still outstanding.
 */
function deferredVerdict(): {
  respond: (response: JudgeResponse) => void;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  let respond!: (response: JudgeResponse) => void;
  const pending = new Promise<JudgeResponse>((resolve) => {
    respond = resolve;
  });
  return { respond, sendMessage: vi.fn().mockReturnValue(pending) };
}

async function setupSpoiler(id: string): Promise<{
  article: HTMLElement;
  sendMessage: ReturnType<typeof vi.fn>;
}> {
  const response: JudgeResponse = { results: { [id]: true } };
  const sendMessage = vi.fn().mockResolvedValue(response);
  await setupPage(sendMessage);

  appendTweets(tweetHtml(id, "erin", "Spoiler-y take."));
  await settle();

  return { article: requireArticle(id), sendMessage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("surviving an X re-render", () => {
  it("keeps the tweet hidden when X rewrites the article's class attribute", async () => {
    const { article } = await setupSpoiler("5005");
    expect(isHidden(article)).toBe(true);

    // X is react-native-web: hover is JS state, so hovering re-renders the
    // article and React writes className from its own props, dropping
    // anything an extension added to that attribute.
    article.className = X_ARTICLE_CLASSES;
    await settle();

    expect(isHidden(article)).toBe(true);
    expect(article.querySelector(REVEAL_SELECTOR)).not.toBeNull();
  });

  it("keeps the reveal control legible instead of blurring it with the tweet", async () => {
    const { article } = await setupSpoiler("5007");

    const shield = article.querySelector(SHIELD_SELECTOR);
    const button = article.querySelector(REVEAL_SELECTOR);
    expect(shield).not.toBeNull();
    expect(button?.parentElement).toBe(shield);

    // The cover blurs what is painted behind it, so its own button stays
    // sharp. A `filter: blur()` anywhere in our CSS would blur the button
    // too, since filters apply to the whole subtree.
    const css = document.head.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/backdrop-filter:\s*blur/);
    expect(css).not.toMatch(/(^|[^-])filter:\s*blur/m);
  });

  it("leaves a revealed tweet revealed across a re-render and a remount", async () => {
    const { article, sendMessage } = await setupSpoiler("5006");

    const button = article.querySelector<HTMLButtonElement>(REVEAL_SELECTOR);
    expect(button).not.toBeNull();
    button?.click();
    expect(isHidden(article)).toBe(false);

    article.className = X_ARTICLE_CLASSES;
    await settle();
    expect(isHidden(article)).toBe(false);

    // React remounting the subtree hands us a brand-new node for the same tweet.
    article.remove();
    appendTweets(tweetHtml("5006", "erin", "Spoiler-y take."));
    await settle();

    expect(isHidden(requireArticle("5006"))).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("fail open", () => {
  it("renders the batch unblurred when the backend reports an error", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ error: true });
    await setupPage(sendMessage);

    appendTweets(tweetHtml("1001", "alice", "Huge upset in the final."));
    await settle();

    const article = requireArticle("1001");
    expect(isHidden(article)).toBe(false);
    expect(article.querySelector(REVEAL_SELECTOR)).toBeNull();
  });

  it("renders the batch unblurred when the judge message itself rejects", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sendMessage = vi.fn().mockRejectedValue(new Error("service worker asleep"));
    await setupPage(sendMessage);

    appendTweets(tweetHtml("1002", "alice", "Another one."));
    await settle();

    const article = requireArticle("1002");
    expect(isHidden(article)).toBe(false);
    expect(article.querySelector(REVEAL_SELECTOR)).toBeNull();
  });
});

describe("judged-tweet cache", () => {
  it("re-renders a reappearing tweet from cache instead of judging it again", async () => {
    const response: JudgeResponse = { results: { "2002": true } };
    const sendMessage = vi.fn().mockResolvedValue(response);
    await setupPage(sendMessage);

    appendTweets(tweetHtml("2002", "bob", "Spoiler-y take."));
    await settle();

    const first = requireArticle("2002");
    expect(isHidden(first)).toBe(true);
    expect(first.querySelector(REVEAL_SELECTOR)).not.toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // X recycles timeline nodes on rescroll: same tweet id, brand new element.
    first.remove();
    appendTweets(tweetHtml("2002", "bob", "Spoiler-y take."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const second = requireArticle("2002");
    expect(second).not.toBe(first);
    expect(isHidden(second)).toBe(true);
    expect(second.querySelector(REVEAL_SELECTOR)).not.toBeNull();
  });

  it("re-renders a reappearing non-spoiler tweet unblurred without judging it again", async () => {
    const response: JudgeResponse = { results: { "2003": false } };
    const sendMessage = vi.fn().mockResolvedValue(response);
    await setupPage(sendMessage);

    appendTweets(tweetHtml("2003", "bob", "Unrelated chatter."));
    await settle();
    requireArticle("2003").remove();
    appendTweets(tweetHtml("2003", "bob", "Unrelated chatter."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const second = requireArticle("2003");
    expect(isHidden(second)).toBe(false);
    expect(second.querySelector(REVEAL_SELECTOR)).toBeNull();
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
    requireArticle("2004").remove();
    appendTweets(tweetHtml("2004", "bob", "Retry me."));
    await settle();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(isHidden(requireArticle("2004"))).toBe(true);
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
    const promoted = requireArticle("promoted");
    expect(isHidden(promoted)).toBe(false);
    expect(promoted.querySelector(REVEAL_SELECTOR)).toBeNull();
  });
});

describe("analysing state", () => {
  it("says a freshly covered post is being analysed, before any verdict exists", async () => {
    // The cover goes on optimistically the moment a post appears. Held here
    // with an unresolved judge response, that is the whole state the user sees.
    const { respond, sendMessage } = deferredVerdict();
    await setupPage(sendMessage);

    appendTweets(tweetHtml("4001", "dana", "Verdict still pending."));
    await wait(0);

    const article = requireArticle("4001");
    expect(isHidden(article)).toBe(true);
    const pending = article.querySelector(PENDING_SELECTOR);
    expect(pending?.textContent).toMatch(/analysing/i);
    expect(article.querySelector(REVEAL_SELECTOR)).toBeNull();

    respond({ results: {} });
  });

  it("swaps the analysing indicator for the spoiler notice when the verdict says spoiler", async () => {
    const { article } = await setupSpoiler("4002");

    expect(article.querySelector(PENDING_SELECTOR)).toBeNull();
    expect(article.querySelector(BADGE_SELECTOR)?.textContent).toMatch(/spoiler detected/i);
  });

  it("takes the cover off altogether when the verdict clears the post", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ results: { "4003": false } });
    await setupPage(sendMessage);

    appendTweets(tweetHtml("4003", "dana", "Nothing to see here."));
    await wait(0);
    expect(requireArticle("4003").querySelector(PENDING_SELECTOR)).not.toBeNull();

    await settle();

    expect(isHidden(requireArticle("4003"))).toBe(false);
  });

  it("keeps the analysing indicator inside the cover, where the backdrop filter leaves it sharp", async () => {
    const { respond, sendMessage } = deferredVerdict();
    await setupPage(sendMessage);

    appendTweets(tweetHtml("4004", "dana", "Verdict still pending."));
    await wait(0);

    const article = requireArticle("4004");
    expect(article.querySelector(PENDING_SELECTOR)?.closest(SHIELD_SELECTOR)).toBe(
      article.querySelector(SHIELD_SELECTOR),
    );

    respond({ results: {} });
  });
});

describe("spoiler notice", () => {
  it("says plainly that the post matched the watchlist", async () => {
    const { article } = await setupSpoiler("4005");

    const shield = article.querySelector(SHIELD_SELECTOR);
    expect(shield?.textContent).toMatch(/watchlist/i);
  });

  it("reveals the post in one click", async () => {
    const { article } = await setupSpoiler("4006");

    const button = article.querySelector<HTMLButtonElement>(REVEAL_SELECTOR);
    expect(button).not.toBeNull();
    button?.click();

    expect(isHidden(article)).toBe(false);
  });
});

describe("injected styles", () => {
  it("defines no custom property on the page root and prefixes every class it styles", async () => {
    await setupPage(vi.fn().mockResolvedValue({ results: {} }));

    // `:root` on X is X's own, so a custom property declared there leaks into
    // their page. Ours are scoped to elements the extension owns.
    const css = document.head.querySelector("style")?.textContent ?? "";
    expect(css).not.toMatch(/:root/);
    expect(css).toMatch(/--ns-/);

    const classSelectors = css.match(/\.[A-Za-z][\w-]*/g) ?? [];
    expect(classSelectors.length).toBeGreaterThan(0);
    for (const selector of classSelectors) {
      expect(selector).toMatch(/^\.no-spoiler-/);
    }
  });
});
