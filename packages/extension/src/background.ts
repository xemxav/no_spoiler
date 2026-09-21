import type { JudgeRequest, JudgeResponse, Tweet } from "@no-spoiler/shared";
import { createChromeStorage, listTopics } from "./watchlist.js";

/**
 * Build-time config, injected by esbuild `--define` (see this package's
 * `build`/`dev` scripts, which read the `BACKEND_URL` environment variable).
 * It defaults to the local sandbox backend;
 * point it at the deployed Railway URL to build against that instead.
 */
declare const __BACKEND_URL__: string;

const BACKEND_URL = __BACKEND_URL__;

const storage = createChromeStorage();

interface JudgeMessage {
  type: "judge";
  tweets: Tweet[];
}

function isJudgeMessage(message: unknown): message is JudgeMessage {
  return (
    typeof message === "object" && message !== null && (message as { type?: unknown }).type === "judge"
  );
}

/** Toolbar badge shown while the backend can't be reached. */
const OFFLINE_BADGE_TEXT = "!";
const OFFLINE_BADGE_COLOR = "#d93025";

function showOfflineBadge(): void {
  void chrome.action.setBadgeText({ text: OFFLINE_BADGE_TEXT });
  void chrome.action.setBadgeBackgroundColor({ color: OFFLINE_BADGE_COLOR });
}

function clearOfflineBadge(): void {
  void chrome.action.setBadgeText({ text: "" });
}

export async function handleJudge(tweets: Tweet[]): Promise<JudgeResponse | { error: true }> {
  try {
    const watchlist = await listTopics(storage);
    const body: JudgeRequest = { watchlist, tweets };
    const res = await fetch(`${BACKEND_URL}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      showOfflineBadge();
      console.warn("no-spoiler: /judge responded with status", res.status);
      return { error: true };
    }
    const response = (await res.json()) as JudgeResponse;
    clearOfflineBadge();
    return response;
  } catch (error) {
    showOfflineBadge();
    console.warn("no-spoiler: /judge request failed", error);
    return { error: true };
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    if (!isJudgeMessage(message)) return false;

    void handleJudge(message.tweets).then(sendResponse);
    return true; // keep the message channel open for the async response
  },
);
