import type { Tweet } from "@no-spoiler/shared";

const STATUS_PERMALINK_PATTERN = /^\/(\w+)\/status\/(\d+)/;

/**
 * Pulls `{id, author, text}` out of a rendered tweet's DOM node. Returns
 * `null` when the node doesn't have the expected shape (missing tweet text,
 * or no status permalink — e.g. a promoted tweet with different markup).
 */
export function extractTweet(article: Element): Tweet | null {
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl?.textContent?.trim();
  if (!text) return null;

  const timeEl = article.querySelector("time");
  const permalink = timeEl?.closest("a[href]");
  const href = permalink?.getAttribute("href") ?? "";
  const match = STATUS_PERMALINK_PATTERN.exec(href);
  if (!match) return null;

  const [, author, id] = match;
  return { id, author, text };
}
