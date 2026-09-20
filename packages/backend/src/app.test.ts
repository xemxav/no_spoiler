import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp, type TypeSafeClientLike } from "./app.js";

function makeClient(systemOne: TypeSafeClientLike["systemOne"]): TypeSafeClientLike {
  return { systemOne };
}

describe("POST /judge", () => {
  it("maps each probability to a spoiler boolean at the 0.5 threshold (>= 0.5 is a spoiler)", async () => {
    const systemOne = vi.fn().mockResolvedValue({
      answers: {
        tweet_1: { type: "noul", noul: 0.9 }, // above threshold -> spoiler
        tweet_2: { type: "noul", noul: 0.5 }, // exactly at threshold -> spoiler (tie-break: >= is spoiler)
        tweet_3: { type: "noul", noul: 0.49 }, // below threshold -> not a spoiler
      },
    });
    const app = createApp(makeClient(systemOne));

    const res = await request(app)
      .post("/judge")
      .send({
        watchlist: ["Lakers vs Celtics 9/19"],
        tweets: [
          { id: "1", author: "alice", text: "Lakers win it 110-100!" },
          { id: "2", author: "bob", text: "what a close game" },
          { id: "3", author: "carol", text: "tuning in now" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: { "1": true, "2": true, "3": false },
    });
  });

  it("short-circuits on an empty watchlist: systemOne is never called, response is all-clear", async () => {
    const systemOne = vi.fn();
    const app = createApp(makeClient(systemOne));

    const res = await request(app)
      .post("/judge")
      .send({
        watchlist: [],
        tweets: [
          { id: "1", author: "alice", text: "hello" },
          { id: "2", author: "bob", text: "world" },
        ],
      });

    expect(systemOne).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: { "1": false, "2": false } });
  });

  it("defaults a missing tweets array to empty instead of throwing", async () => {
    const systemOne = vi.fn();
    const app = createApp(makeClient(systemOne));

    const res = await request(app).post("/judge").send({ watchlist: [] });

    expect(systemOne).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: {} });
  });

  it("builds one noul question per tweet, referencing that tweet's text and the watchlist", async () => {
    const systemOne = vi.fn().mockResolvedValue({
      answers: { tweet_42: { type: "noul", noul: 0.1 } },
    });
    const app = createApp(makeClient(systemOne));

    await request(app)
      .post("/judge")
      .send({
        watchlist: ["The Last of Us S2"],
        tweets: [{ id: "42", author: "dana", text: "Joel dies in episode 2" }],
      });

    expect(systemOne).toHaveBeenCalledTimes(1);
    const callArgs = systemOne.mock.calls[0][0] as {
      state: unknown;
      questions: Record<string, unknown>;
    };

    expect(callArgs.state).toEqual({
      watchlist: ["The Last of Us S2"],
      tweets: [{ id: "42", author: "dana", text: "Joel dies in episode 2" }],
    });

    const questionKeys = Object.keys(callArgs.questions);
    expect(questionKeys).toEqual(["tweet_42"]);

    const question = JSON.stringify(callArgs.questions.tweet_42);
    expect(question).toContain("watchlist");
    expect(question).toContain("tweets[0].text");
  });

  it("responds 502 when systemOne rejects, instead of crashing", async () => {
    const systemOne = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
    const app = createApp(makeClient(systemOne));

    const res = await request(app)
      .post("/judge")
      .send({
        watchlist: ["Lakers vs Celtics 9/19"],
        tweets: [{ id: "1", author: "alice", text: "final score in" }],
      });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Failed to judge tweets" });
  });
});
