import { describe, expect, it } from "vitest";
import { extractTweet } from "./extract-tweet.js";

// Approximates current X/Twitter tweet markup: an `article[data-testid="tweet"]`
// containing a `[data-testid="tweetText"]` block and a permalink `<a>` (wrapping
// a `<time>`) shaped like `/<username>/status/<numericId>`.
const NORMAL_TWEET_HTML = `
  <article data-testid="tweet">
    <div data-testid="User-Name">
      <a href="/alice/status/1234567890123456789" role="link">
        <time datetime="2026-09-20T12:00:00.000Z">2h</time>
      </a>
    </div>
    <div data-testid="tweetText">
      <span>Just watched the game, what a nail-biter.</span>
    </div>
  </article>
`;

const MISSING_TEXT_HTML = `
  <article data-testid="tweet">
    <div data-testid="User-Name">
      <a href="/bob/status/9876543210987654321" role="link">
        <time datetime="2026-09-20T12:05:00.000Z">1h</time>
      </a>
    </div>
  </article>
`;

// Approximates a promoted tweet: no status permalink wrapping a <time>.
const MISSING_PERMALINK_HTML = `
  <article data-testid="tweet">
    <div data-testid="User-Name">
      <span>Promoted</span>
    </div>
    <div data-testid="tweetText">
      <span>Buy now, limited offer!</span>
    </div>
  </article>
`;

function parseArticle(html: string): Element {
  const container = document.createElement("div");
  container.innerHTML = html;
  const article = container.querySelector("article");
  if (!article) throw new Error("fixture missing <article>");
  return article;
}

describe("extractTweet", () => {
  it("extracts id, author, and text from a well-formed tweet", () => {
    const article = parseArticle(NORMAL_TWEET_HTML);

    const tweet = extractTweet(article);

    expect(tweet).toEqual({
      id: "1234567890123456789",
      author: "alice",
      text: "Just watched the game, what a nail-biter.",
    });
  });

  it("returns null when tweet text is missing", () => {
    const article = parseArticle(MISSING_TEXT_HTML);

    expect(extractTweet(article)).toBeNull();
  });

  it("returns null when the status permalink is missing (e.g. a promoted tweet)", () => {
    const article = parseArticle(MISSING_PERMALINK_HTML);

    expect(extractTweet(article)).toBeNull();
  });
});
