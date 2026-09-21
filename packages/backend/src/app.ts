import express, { type Express, type Request, type Response } from "express";
import { noul, type NoulQuestion, type NoulResponse } from "@typesafe-ai/sdk";
import type { JudgeRequest, JudgeResponse, Tweet } from "@no-spoiler/shared";

/** Probability >= this threshold is judged a spoiler. Tie goes to "spoiler". */
const SPOILER_THRESHOLD = 0.5;

/**
 * Shape of the TypeSafe client this module depends on. Matches
 * `TypeSafeClient#systemOne` from `@typesafe-ai/sdk` structurally (specialized
 * to `noul` questions, the only kind this endpoint asks), so the real client
 * can be passed directly, and a test double can stand in for it.
 */
export interface TypeSafeClientLike {
  systemOne(args: {
    state: unknown;
    questions: Record<string, NoulQuestion>;
  }): Promise<{ answers: Record<string, NoulResponse> }>;
}

function questionKey(tweetId: string): string {
  return `tweet_${tweetId}`;
}

function buildResults(tweets: Tweet[], isSpoiler: (tweet: Tweet) => boolean): JudgeResponse {
  const results: Record<string, boolean> = {};
  for (const tweet of tweets) {
    results[tweet.id] = isSpoiler(tweet);
  }
  return { results };
}

/**
 * Listen options, from `PORT` and `HOST`.
 *
 * `HOST` defaults to loopback so a local sandbox is reachable from this machine
 * only — `/judge` has no auth, and binding every interface would let anyone on
 * the same network spend the owner's TypeSafe key. A deployed context must set
 * `HOST=0.0.0.0` explicitly: a platform like Railway routes to the container's
 * external interface, so loopback there is unreachable. That failure is loud
 * (the deploy doesn't answer) where the reverse default fails silently.
 */
export function resolveListenOptions(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  host: string;
} {
  return { port: Number(env.PORT ?? 3210), host: env.HOST ?? "127.0.0.1" };
}

export function createApp(client: TypeSafeClientLike): Express {
  const app = express();
  app.use(express.json());

  /**
   * Liveness only. It deliberately never reaches the judgment client, so the
   * extension can call it as often as it likes without spending quota — which
   * is what makes a "test the engine" button in the popup cheap enough to
   * press freely.
   */
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/judge", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<JudgeRequest>;
    const watchlist = body.watchlist ?? [];
    const tweets = body.tweets ?? [];

    if (watchlist.length === 0) {
      res.json(buildResults(tweets, () => false));
      return;
    }

    const questions: Record<string, NoulQuestion> = {};
    tweets.forEach((tweet, index) => {
      questions[questionKey(tweet.id)] = noul(
        `Does this tweet contain a spoiler (a result, outcome, or plot reveal) for any topic in \`watchlist\`, given \`tweets[${index}].text\`?`,
      );
    });

    try {
      const result = await client.systemOne({
        state: { watchlist, tweets },
        questions,
      });

      const response = buildResults(tweets, (tweet) => {
        const probability = result.answers[questionKey(tweet.id)]?.noul ?? 0;
        return probability >= SPOILER_THRESHOLD;
      });
      res.json(response);
    } catch {
      res.status(502).json({ error: "Failed to judge tweets" });
    }
  });

  return app;
}
