import type { JudgeResponse, Tweet } from "@no-spoiler/shared";
import { createChromeStorage, listTopics } from "./watchlist.js";
import { extractTweet } from "./extract-tweet.js";

const DEBOUNCE_MS = 300;
const SHIELD_CLASS = "no-spoiler-shield";
const PENDING_CLASS = "no-spoiler-pending";
const BADGE_CLASS = "no-spoiler-badge";
const HEADLINE_CLASS = "no-spoiler-headline";
const REVEAL_CLASS = "no-spoiler-reveal";
const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const SVG_NS = "http://www.w3.org/2000/svg";

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
 * the cover's own contents legible. `filter: blur()` on the article would blur
 * them too, because a filter applies to the whole subtree.
 *
 * `:has()` gives the cover a positioned containing block without touching
 * the article's class or style attributes either.
 *
 * Design tokens are declared on our own cover element rather than `:root`:
 * `:root` here is X's, and properties defined there would leak into their
 * page. Declared on the cover they reach our subtree and nothing else.
 *
 * X ships a light and a dark theme, so the cover cannot assume either. The
 * scrim is near-opaque paper and everything on it is ink, which is a verified
 * 17.4:1 — contrast holds whichever theme X painted behind, instead of
 * depending on it.
 */
function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    ${TWEET_SELECTOR}:has(> .${SHIELD_CLASS}) {
      position: relative;
    }
    .${SHIELD_CLASS} {
      --ns-ink: #141218;
      --ns-coral: #FF3D5A;
      --ns-amber: #FFD84D;
      --ns-teal: #00C2A8;
      position: absolute;
      inset: 0;
      z-index: 9999;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 13px;
      overflow: hidden;
      padding: 16px 24px;
      /* --ns-paper at 90%, so the blur behind still reads as motion. */
      background: rgba(251, 247, 240, 0.9);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      font-family: system-ui, sans-serif;
      color: var(--ns-ink);
    }
    .${PENDING_CLASS} {
      position: absolute;
      top: 12px;
      right: 14px;
      box-sizing: border-box;
      border: 2px solid var(--ns-ink);
      border-radius: 999px;
      background: var(--ns-amber);
      color: var(--ns-ink);
      padding: 5px 11px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 2px solid var(--ns-ink);
      border-radius: 999px;
      background: var(--ns-coral);
      color: var(--ns-ink);
      padding: 5px 13px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }
    .${HEADLINE_CLASS} {
      margin: 0;
      max-width: 420px;
      text-align: center;
      font-size: 18px;
      line-height: 1.15;
      font-weight: 800;
      letter-spacing: -0.4px;
      color: var(--ns-ink);
    }
    .${REVEAL_CLASS} {
      height: 46px;
      padding: 0 26px;
      border: 2px solid var(--ns-ink);
      border-radius: 14px;
      background: var(--ns-teal);
      color: var(--ns-ink);
      box-shadow: 4px 4px 0 var(--ns-ink);
      font-family: inherit;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 120ms ease-out, box-shadow 120ms ease-out;
    }
    .${REVEAL_CLASS}:active {
      transform: translate(4px, 4px);
      box-shadow: none;
    }
    .${REVEAL_CLASS}:focus-visible {
      outline: 3px solid var(--ns-ink);
      outline-offset: 3px;
    }
    @media (prefers-reduced-motion: reduce) {
      .${REVEAL_CLASS} {
        transition: none;
      }
      .${REVEAL_CLASS}:active {
        transform: none;
        box-shadow: 4px 4px 0 var(--ns-ink);
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * The mark, reduced to its two-disc form — the badge renders it small enough
 * that the third disc would turn to mush. See "Identity" in the design system.
 */
function createMark(size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  for (const disc of [
    { cx: 44, opacity: "0.35" },
    { cx: 26, opacity: "1" },
  ]) {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(disc.cx));
    circle.setAttribute("cy", "32");
    circle.setAttribute("r", "19");
    circle.setAttribute("fill", "#141218");
    circle.setAttribute("opacity", disc.opacity);
    svg.appendChild(circle);
  }
  return svg;
}

function shieldOf(article: Element): Element | null {
  return article.querySelector(`:scope > .${SHIELD_CLASS}`);
}

function coverTweet(article: Element): Element {
  const existing = shieldOf(article);
  if (existing) return existing;
  const shield = document.createElement("div");
  shield.className = SHIELD_CLASS;
  article.appendChild(shield);
  return shield;
}

function uncoverTweet(article: Element): void {
  shieldOf(article)?.remove();
}

/**
 * The cover goes on optimistically, before any verdict exists. Without this
 * indicator a post awaiting judgment is indistinguishable from a confirmed
 * spoiler, so every new post in the timeline flashes as one.
 */
function showAnalysing(article: Element): void {
  const shield = coverTweet(article);
  if (shield.firstChild) return; // a verdict already rendered here
  const chip = document.createElement("div");
  chip.className = PENDING_CLASS;
  chip.textContent = "Analysing\u2026";
  shield.appendChild(chip);
}

/**
 * The badge, the headline and the button sit directly in the cover rather than
 * in a card of their own, so the backdrop filter leaves every one of them
 * sharp — the same reason the reveal control has always lived there.
 */
function showSpoilerNotice(article: Element, tweetId: string): void {
  const shield = coverTweet(article);
  if (shield.querySelector(`.${BADGE_CLASS}`)) return;

  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.appendChild(createMark(15));
  badge.appendChild(document.createTextNode("Spoiler detected"));

  const headline = document.createElement("p");
  headline.className = HEADLINE_CLASS;
  headline.textContent = "This post matches a topic on your watchlist.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = REVEAL_CLASS;
  button.textContent = "Reveal";
  button.addEventListener("click", () => {
    revealed.add(tweetId);
    uncoverTweet(article);
  });

  // Replaces the analysing chip rather than joining it: the verdict is in.
  shield.replaceChildren(badge, headline, button);
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
    showSpoilerNotice(article, tweetId);
  } else {
    uncoverTweet(article);
  }
}

/** Fail open: drop the optimistic blur so the tweet reads normally. */
function failOpen(extracted: ExtractedTweet[]): void {
  for (const { article } of extracted) {
    uncoverTweet(article);
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
        uncoverTweet(article);
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
      showAnalysing(article);
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
