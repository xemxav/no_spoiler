import type { JudgeResponse, Tweet } from "@no-spoiler/shared";
import { createChromeStorage, listTopics } from "./watchlist.js";
import { extractTweet } from "./extract-tweet.js";

const DEBOUNCE_MS = 300;
const SHIELD_CLASS = "no-spoiler-shield";
const REVEAL_CLASS = "no-spoiler-reveal";
const TWEET_SELECTOR = 'article[data-testid="tweet"]';

const storage = createChromeStorage();

type JudgeMessageResponse = JudgeResponse | { error: true };

/**
 * The blur lives on a cover element appended to the tweet, never on the
 * tweet's own class attribute. X is react-native-web, which has no CSS
 * `:hover` — hover is React state, so hovering an article re-renders it and
 * React rewrites `className` from its own props, dropping anything we added
 * there. Children we append are not part of React's tracked output and
 * survive that re-render, so the cover does too.
 *
 * `backdrop-filter` blurs what is painted *behind* the cover, which leaves
 * the reveal button inside it legible. `filter: blur()` on the article would
 * blur the button too, because a filter applies to the whole subtree.
 *
 * `:has()` gives the cover a positioned containing block without touching
 * the article's class or style attributes either.
 */
function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    ${TWEET_SELECTOR}:has(> .${SHIELD_CLASS}) {
      position: relative;
    }
    .${SHIELD_CLASS} {
      position: absolute;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .${REVEAL_CLASS} {
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      border: none;
      border-radius: 9999px;
      padding: 8px 16px;
      cursor: pointer;
      font: inherit;
    }
  `;
  document.head.appendChild(style);
}

function shieldOf(article: Element): Element | null {
  return article.querySelector(`:scope > .${SHIELD_CLASS}`);
}

function blurTweet(article: Element): Element {
  const existing = shieldOf(article);
  if (existing) return existing;
  const shield = document.createElement("div");
  shield.className = SHIELD_CLASS;
  article.appendChild(shield);
  return shield;
}

function unblurTweet(article: Element): void {
  shieldOf(article)?.remove();
}

function addRevealControl(article: Element, tweetId: string): void {
  const shield = blurTweet(article);
  if (shield.querySelector(`.${REVEAL_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = REVEAL_CLASS;
  button.textContent = "Reveal spoiler";
  button.addEventListener("click", () => {
    revealed.add(tweetId);
    unblurTweet(article);
  });
  shield.appendChild(button);
}

function findNewTweets(mutations: MutationRecord[], seen: Set<Element>): Element[] {
  const found = new Set<Element>();
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(TWEET_SELECTOR) && !seen.has(node)) {
        found.add(node);
      }
      for (const el of node.querySelectorAll(TWEET_SELECTOR)) {
        if (!seen.has(el)) found.add(el);
      }
    }
  }
  return [...found];
}

interface ExtractedTweet {
  tweet: Tweet;
  article: Element;
}

/**
 * Verdicts for tweets already judged in this page session, keyed by tweet id.
 * X recycles timeline nodes on rescroll, so an element-keyed set can't tell
 * that a reappearing tweet has been judged before — the id can.
 */
const judged = new Map<string, boolean>();

/**
 * Tweets the user chose to reveal. A revealed tweet must stay revealed even
 * when X remounts its article and the cached verdict would blur it again.
 */
const revealed = new Set<string>();

function renderVerdict(article: Element, tweetId: string, isSpoiler: boolean): void {
  if (isSpoiler && !revealed.has(tweetId)) {
    addRevealControl(article, tweetId);
  } else {
    unblurTweet(article);
  }
}

/** Fail open: drop the optimistic blur so the tweet reads normally. */
function failOpen(extracted: ExtractedTweet[]): void {
  for (const { article } of extracted) {
    unblurTweet(article);
  }
}

async function judgeBatch(tweets: Tweet[]): Promise<JudgeMessageResponse> {
  return (await chrome.runtime.sendMessage({ type: "judge", tweets })) as JudgeMessageResponse;
}

function applyResults(extracted: ExtractedTweet[], response: JudgeMessageResponse): void {
  if ("error" in response) {
    failOpen(extracted);
    return;
  }
  for (const { tweet, article } of extracted) {
    const isSpoiler = Boolean(response.results[tweet.id]);
    judged.set(tweet.id, isSpoiler);
    renderVerdict(article, tweet.id, isSpoiler);
  }
}

let observer: MutationObserver | undefined;
let stylesInjected = false;

function startObserving(): void {
  if (observer) return; // already observing

  if (!stylesInjected) {
    injectStyles();
    stylesInjected = true;
  }

  const seen = new Set<Element>();
  let buffer: Element[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    const batch = buffer;
    buffer = [];
    timer = undefined;

    const extracted: ExtractedTweet[] = [];
    for (const article of batch) {
      const tweet = extractTweet(article);
      if (!tweet) {
        // Malformed/promoted markup: skip it silently and leave it as X rendered it.
        unblurTweet(article);
        continue;
      }
      const verdict = judged.get(tweet.id);
      if (verdict !== undefined) {
        renderVerdict(article, tweet.id, verdict);
        continue;
      }
      extracted.push({ tweet, article });
    }
    if (extracted.length === 0) return;

    judgeBatch(extracted.map((e) => e.tweet))
      .then((response) => applyResults(extracted, response))
      .catch((error: unknown) => {
        failOpen(extracted);
        console.warn("no-spoiler: judge request failed", error);
      });
  }

  observer = new MutationObserver((mutations) => {
    const newTweets = findNewTweets(mutations, seen);
    if (newTweets.length === 0) return;

    for (const article of newTweets) {
      seen.add(article);
      blurTweet(article);
      buffer.push(article);
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserving(): void {
  observer?.disconnect();
  observer = undefined;
}

/**
 * Starts or stops observing based on the current watchlist. X is a
 * single-page app, so this content script stays alive across in-app
 * navigation — it must react to watchlist changes made via the popup while
 * the tab is open, not just check once at injection time, or "no blur when
 * the watchlist is empty" stops holding for the rest of the session.
 */
async function syncWithWatchlist(): Promise<void> {
  const topics = await listTopics(storage);
  if (topics.length === 0) {
    stopObserving();
  } else {
    startObserving();
  }
}

syncWithWatchlist().catch((error: unknown) => {
  console.warn("no-spoiler: failed to read watchlist", error);
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== "local") return;
  syncWithWatchlist().catch((error: unknown) => {
    console.warn("no-spoiler: failed to read watchlist", error);
  });
});
