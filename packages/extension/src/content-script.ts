import type { JudgeResponse, Tweet } from "@no-spoiler/shared";
import { listTopics } from "./watchlist.js";
import { isEnabled } from "./settings.js";
import { createChromeStorage } from "./storage.js";
import { extractTweet } from "./extract-tweet.js";

const DEBOUNCE_MS = 300;
const SHIELD_CLASS = "no-spoiler-shield";
const PENDING_CLASS = "no-spoiler-pending";
const BADGE_CLASS = "no-spoiler-badge";
const HEADLINE_CLASS = "no-spoiler-headline";
const REVEAL_CLASS = "no-spoiler-reveal";
const PILL_CLASS = "no-spoiler-pill";
const PILL_DOT_CLASS = "no-spoiler-pill-dot";
const PILL_MARK_CLASS = "no-spoiler-pill-mark";
const PILL_TITLE_CLASS = "no-spoiler-pill-title";
const PILL_DETAIL_CLASS = "no-spoiler-pill-detail";
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
    .${SHIELD_CLASS},
    .${PILL_CLASS} {
      --ns-paper: #FBF7F0;
      --ns-ink: #141218;
      --ns-coral: #FF3D5A;
      --ns-amber: #FFD84D;
      --ns-teal: #00C2A8;
    }
    .${SHIELD_CLASS} {
      position: absolute;
      inset: 0;
      z-index: 9999;
      box-sizing: border-box;
      /* Takes the post's own corner radius, whatever X has set it to. */
      border-radius: inherit;
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
      /*
       * Not the design system's families: the shipped woff2 files are not
       * web-accessible resources, and making them so would advertise the
       * extension's presence to every page. Both families fall back to
       * system-ui anyway, which is what the page gets here.
       */
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
    .${PILL_CLASS} {
      position: fixed;
      bottom: 16px;
      /* Left, not right: X's message drawer owns the bottom-right on desktop. */
      left: 16px;
      z-index: 2147483000;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 9px;
      max-width: 300px;
      padding: 8px 14px 8px 11px;
      border: 2px solid var(--ns-ink);
      border-radius: 18px;
      background: var(--ns-paper);
      box-shadow: 3px 3px 0 var(--ns-ink);
      color: var(--ns-ink);
      font-family: system-ui, sans-serif;
      text-align: left;
    }
    .${PILL_CLASS}[data-state="unreachable"] {
      background: var(--ns-coral);
    }
    .${PILL_MARK_CLASS} {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      overflow: hidden;
      border: 2px solid var(--ns-ink);
      border-radius: 999px;
      background: var(--ns-teal);
    }
    .${PILL_CLASS}[data-state="unreachable"] .${PILL_MARK_CLASS} {
      background: var(--ns-paper);
    }
    .${PILL_DOT_CLASS} {
      flex-shrink: 0;
      width: 9px;
      height: 9px;
      border: 1.5px solid var(--ns-ink);
      border-radius: 999px;
      background: var(--ns-teal);
    }
    .${PILL_CLASS}[data-state="unreachable"] .${PILL_DOT_CLASS} {
      /* Coral on coral would vanish; the word beside it carries the state. */
      background: var(--ns-paper);
    }
    .${PILL_TITLE_CLASS} {
      display: block;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.1px;
    }
    /*
     * Collapsed with height and opacity rather than \`display: none\`, so the
     * detail stays in the accessibility tree for anyone who is not hovering.
     */
    .${PILL_DETAIL_CLASS} {
      display: block;
      max-height: 0;
      margin-top: 0;
      opacity: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.3;
      transition:
        max-height 160ms ease-out,
        opacity 160ms ease-out,
        margin-top 160ms ease-out;
    }
    .${PILL_CLASS}:hover .${PILL_DETAIL_CLASS} {
      max-height: 32px;
      margin-top: 2px;
      opacity: 1;
    }
    /*
     * The alarm does not animate in and does not collapse. A message this
     * important must not depend on a transition having run, or on anyone
     * hovering to see it.
     */
    .${PILL_CLASS}[data-state="unreachable"] .${PILL_DETAIL_CLASS} {
      max-height: none;
      margin-top: 2px;
      opacity: 1;
      transition: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .${REVEAL_CLASS} {
        transition: none;
      }
      .${REVEAL_CLASS}:active {
        transform: none;
        box-shadow: 4px 4px 0 var(--ns-ink);
      }
      .${PILL_DETAIL_CLASS} {
        transition: none;
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

/**
 * The pill: the only in-page evidence that the extension is running, and the
 * only place the user learns that it has stopped protecting them. Because the
 * extension fails open, an unreachable engine is otherwise indistinguishable
 * from a clean timeline — which is this product's worst failure mode.
 *
 * Fixed to the viewport and appended to <body>, well outside any post
 * subtree: anything inside an article is subject to the same React re-render
 * that forced the cover element. It carries no controls; every action lives in
 * the popup.
 */
let pill: HTMLElement | undefined;
let watchedTopics = 0;

/** Whether the most recent judgment attempt reached the engine. */
let engineReachable = true;

function renderPill(): void {
  if (!pill) return;
  pill.dataset.state = engineReachable ? "resting" : "unreachable";

  const title = pill.querySelector(`.${PILL_TITLE_CLASS}`);
  const detail = pill.querySelector(`.${PILL_DETAIL_CLASS}`);
  if (!title || !detail) return;

  if (engineReachable) {
    title.textContent = "No Spoiler";
    const plural = watchedTopics === 1 ? "topic" : "topics";
    detail.textContent = `${watchedTopics} ${plural} watched on ${location.hostname}`;
  } else {
    title.textContent = "Engine unreachable";
    detail.textContent = "Nothing is being filtered";
  }
}

function showPill(topicCount: number): void {
  watchedTopics = topicCount;
  if (!pill) {
    pill = document.createElement("div");
    pill.className = PILL_CLASS;
    // Announced as a state, not as something to interact with.
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");

    // The design system's one sanctioned exception: here the tile takes the
    // state colour and the glyph carries the brand.
    const mark = document.createElement("span");
    mark.className = PILL_MARK_CLASS;
    mark.appendChild(createMark(16));
    pill.appendChild(mark);

    const dot = document.createElement("span");
    dot.className = PILL_DOT_CLASS;
    dot.setAttribute("aria-hidden", "true");
    pill.appendChild(dot);

    const text = document.createElement("span");
    const title = document.createElement("span");
    title.className = PILL_TITLE_CLASS;
    const detail = document.createElement("span");
    detail.className = PILL_DETAIL_CLASS;
    text.append(title, detail);
    pill.appendChild(text);
  }
  if (!pill.isConnected) document.body.appendChild(pill);
  renderPill();
}

function hidePill(): void {
  pill?.remove();
  pill = undefined;
}

/**
 * Mirrors how the background worker drives the toolbar badge: the transition
 * is made where the verdicts arrive, not tracked separately.
 */
function setEngineReachable(reachable: boolean): void {
  if (engineReachable === reachable) return;
  engineReachable = reachable;
  renderPill();
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
    setEngineReachable(false);
    failOpen(extracted);
    return;
  }
  setEngineReachable(true);
  for (const { tweet, article } of extracted) {
    const isSpoiler = Boolean(response.results[tweet.id]);
    judged.set(tweet.id, isSpoiler);
    renderVerdict(article, tweet.id, isSpoiler);
  }
}

let observer: MutationObserver | undefined;
let stylesInjected = false;

function startObserving(topicCount: number): void {
  // Styles first: the pill goes into the page on the next line.
  if (!stylesInjected) {
    injectStyles();
    stylesInjected = true;
  }
  showPill(topicCount);
  if (observer) return; // already observing

  const seen = new Set<Element>();
  let buffer: Element[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function queue(articles: Iterable<Element>): void {
    let queued = false;
    for (const article of articles) {
      if (seen.has(article)) continue;
      seen.add(article);
      showAnalysing(article);
      buffer.push(article);
      queued = true;
    }
    if (!queued) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

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
        setEngineReachable(false);
        failOpen(extracted);
        console.warn("no-spoiler: judge request failed", error);
      });
  }

  observer = new MutationObserver((mutations) => {
    // X is a single-page app: in-app navigation can take our pill out of the
    // page along with everything else. Put it back.
    if (pill && !pill.isConnected) document.body.appendChild(pill);
    queue(findNewTweets(mutations, seen));
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Posts already rendered when protection starts. The observer only ever
  // sees nodes added after it, so without this a spoiler sitting in the
  // viewport stays readable until X happens to mutate the timeline — which
  // is the whole of "switching back on resumes protection on this tab".
  // Anything already judged this session comes back from the cache in flush().
  queue(document.querySelectorAll(TWEET_SELECTOR));
}

/**
 * Stopping has to take the covers off as well as stop adding them: leaving
 * the page covered until a reload is exactly what the switch exists to avoid.
 * `judged` and `revealed` are left alone — they describe the page session,
 * not the protection state, and survive an off/on cycle.
 */
function stopObserving(): void {
  observer?.disconnect();
  observer = undefined;
  hidePill();
  for (const shield of document.querySelectorAll(`.${SHIELD_CLASS}`)) {
    shield.remove();
  }
}

/**
 * Starts or stops protecting the feed. X is a single-page app, so this content
 * script stays alive across in-app navigation — it must react to changes made
 * via the popup while the tab is open, not just check once at injection time,
 * or "no cover when the watchlist is empty" stops holding for the rest of the
 * session. The same listener carries the master switch: no new plumbing.
 */
async function syncProtection(): Promise<void> {
  const [topics, enabled] = await Promise.all([listTopics(storage), isEnabled(storage)]);
  if (!enabled || topics.length === 0) {
    stopObserving();
  } else {
    startObserving(topics.length);
  }
}

function syncProtectionInBackground(): void {
  syncProtection().catch((error: unknown) => {
    console.warn("no-spoiler: failed to read settings", error);
  });
}

syncProtectionInBackground();

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== "local") return;
  syncProtectionInBackground();
});
