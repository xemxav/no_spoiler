import type { JudgeResponse, Tweet } from "@no-spoiler/shared";
import { listTopics, type WatchlistStorage } from "./watchlist.js";
import { extractTweet } from "./extract-tweet.js";

const DEBOUNCE_MS = 300;
const BLUR_CLASS = "no-spoiler-blur";
const REVEAL_CLASS = "no-spoiler-reveal";
const TWEET_SELECTOR = 'article[data-testid="tweet"]';

const storage: WatchlistStorage = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

type JudgeMessageResponse = JudgeResponse | { error: true };

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    .${BLUR_CLASS} {
      filter: blur(12px);
      position: relative;
    }
    .${REVEAL_CLASS} {
      position: absolute;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.4);
      color: #fff;
      border: none;
      cursor: pointer;
      font: inherit;
    }
  `;
  document.head.appendChild(style);
}

function blurTweet(article: Element): void {
  article.classList.add(BLUR_CLASS);
}

function unblurTweet(article: Element): void {
  article.classList.remove(BLUR_CLASS);
  article.querySelector(`.${REVEAL_CLASS}`)?.remove();
}

function addRevealControl(article: Element): void {
  if (article.querySelector(`.${REVEAL_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = REVEAL_CLASS;
  button.textContent = "Reveal spoiler";
  button.addEventListener("click", () => {
    unblurTweet(article);
  });
  article.appendChild(button);
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

async function judgeBatch(tweets: Tweet[]): Promise<JudgeMessageResponse> {
  return (await chrome.runtime.sendMessage({ type: "judge", tweets })) as JudgeMessageResponse;
}

function applyResults(elementsById: Map<string, Element>, response: JudgeMessageResponse): void {
  if ("error" in response) {
    // Leave the optimistic blur in place on error. Fail-open handling belongs to #8.
    return;
  }
  for (const [id, article] of elementsById) {
    if (response.results[id]) {
      addRevealControl(article);
    } else {
      unblurTweet(article);
    }
  }
}

function startObserving(): void {
  injectStyles();

  const seen = new Set<Element>();
  let buffer: Element[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    const batch = buffer;
    buffer = [];
    timer = undefined;

    const elementsById = new Map<string, Element>();
    const tweets: Tweet[] = [];
    for (const article of batch) {
      const tweet = extractTweet(article);
      if (!tweet) continue; // malformed/promoted markup, just skip it
      elementsById.set(tweet.id, article);
      tweets.push(tweet);
    }
    if (tweets.length === 0) return;

    judgeBatch(tweets)
      .then((response) => applyResults(elementsById, response))
      .catch((error: unknown) => {
        console.warn("no-spoiler: judge request failed", error);
      });
  }

  const observer = new MutationObserver((mutations) => {
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

listTopics(storage)
  .then((topics) => {
    if (topics.length === 0) return; // nothing to watch for, no blur, no requests
    startObserving();
  })
  .catch((error: unknown) => {
    console.warn("no-spoiler: failed to read watchlist", error);
  });
