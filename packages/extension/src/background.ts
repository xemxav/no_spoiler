import type { JudgeRequest, JudgeResponse, Tweet } from "@no-spoiler/shared";
import { createChromeStorage, listTopics } from "./watchlist.js";

/** Local backend, dev-only. A configurable/deployed URL is a separate ticket (#9). */
const DEFAULT_BACKEND_URL = "http://localhost:3210";

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

async function handleJudge(tweets: Tweet[]): Promise<JudgeResponse | { error: true }> {
  try {
    const watchlist = await listTopics(storage);
    const body: JudgeRequest = { watchlist, tweets };
    const res = await fetch(`${DEFAULT_BACKEND_URL}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("no-spoiler: /judge responded with status", res.status);
      return { error: true };
    }
    return (await res.json()) as JudgeResponse;
  } catch (error) {
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
