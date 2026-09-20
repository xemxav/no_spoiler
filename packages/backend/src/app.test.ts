import type { AddressInfo } from "node:net";

import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp, resolveListenOptions, type TypeSafeClientLike } from "./app.js";

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

describe("POST /judge shared-secret auth", () => {
  const AUTH_TOKEN = "s3cret-token";

  function judge(app: Express, authorization?: string) {
    const pending = request(app).post("/judge");
    if (authorization !== undefined) {
      void pending.set("Authorization", authorization);
    }
    return pending.send({
      watchlist: ["Lakers vs Celtics 9/19"],
      tweets: [{ id: "1", author: "alice", text: "Lakers win it 110-100!" }],
    });
  }

  function answeringClient() {
    return vi.fn().mockResolvedValue({ answers: { tweet_1: { type: "noul", noul: 0.9 } } });
  }

  it("rejects a request with no Authorization header with 401 when a token is configured", async () => {
    const systemOne = answeringClient();
    const app = createApp(makeClient(systemOne), { authToken: AUTH_TOKEN });

    const res = await judge(app);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("rejects a mismatched bearer token with 401", async () => {
    const systemOne = answeringClient();
    const app = createApp(makeClient(systemOne), { authToken: AUTH_TOKEN });

    const res = await judge(app, "Bearer wrong-token");

    expect(res.status).toBe(401);
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("accepts the configured bearer token", async () => {
    const systemOne = answeringClient();
    const app = createApp(makeClient(systemOne), { authToken: AUTH_TOKEN });

    const res = await judge(app, `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: { "1": true } });
  });

  it("requires no auth when no token is configured (the local sandbox case)", async () => {
    const systemOne = answeringClient();
    const app = createApp(makeClient(systemOne));

    const res = await judge(app);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: { "1": true } });
  });

  it("treats a blank configured token as not configured", async () => {
    const app = createApp(makeClient(answeringClient()), { authToken: "  " });

    const res = await judge(app);

    expect(res.status).toBe(200);
  });
});

describe("resolveListenOptions", () => {
  it("defaults to port 3210 on 0.0.0.0 when PORT is unset", () => {
    expect(resolveListenOptions({})).toEqual({ port: 3210, host: "0.0.0.0" });
  });

  it("uses PORT from the environment, as a platform like Railway injects it", () => {
    expect(resolveListenOptions({ PORT: "8080" })).toEqual({ port: 8080, host: "0.0.0.0" });
  });

  it("binds the app on 0.0.0.0 with the resolved options", async () => {
    const app = createApp(makeClient(vi.fn()));
    // PORT=0 lets the OS pick a free port, so this test can't collide with a running sandbox.
    const { port, host } = resolveListenOptions({ PORT: "0" });

    const address = await new Promise<AddressInfo>((resolveAddress) => {
      const server = app.listen(port, host, () => {
        const info = server.address() as AddressInfo;
        server.close(() => resolveAddress(info));
      });
    });

    expect(address.address).toBe("0.0.0.0");
  });
});
