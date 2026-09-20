import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
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

export interface CreateAppOptions {
  /**
   * Shared secret callers must present as `Authorization: Bearer <token>`.
   * Blank or omitted means no auth at all, which is the local sandbox case:
   * the secret only matters once the backend is on a public URL, where an
   * open `/judge` would let anyone burn the owner's TypeSafe API key.
   */
  authToken?: string;
}

/**
 * Rejects requests whose bearer token doesn't match `expectedToken` with 401.
 * A blank `expectedToken` means "not configured": every request is let through.
 */
function requireBearerToken(expectedToken: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (expectedToken === "") {
      next();
      return;
    }

    const header = req.get("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

    if (presented !== expectedToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}

/**
 * Listen options for a deployed context: the host is always `0.0.0.0` (a
 * platform like Railway routes to the container's external interface, so
 * binding loopback only would be unreachable) and the port comes from the
 * platform-injected `PORT`, falling back to the sandbox default.
 */
export function resolveListenOptions(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  host: string;
} {
  return { port: Number(env.PORT ?? 3210), host: "0.0.0.0" };
}

export function createApp(client: TypeSafeClientLike, options: CreateAppOptions = {}): Express {
  const app = express();
  app.use(express.json());

  const authToken = (options.authToken ?? "").trim();

  app.post("/judge", requireBearerToken(authToken), async (req: Request, res: Response) => {
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
