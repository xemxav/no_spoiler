import { describe, expect, it } from "vitest";
import { addTopic, listTopics, removeTopic, type WatchlistStorage } from "./watchlist.js";

function createFakeStorage(
  initial: Record<string, unknown> = {},
  store: Record<string, unknown> = { ...initial },
): WatchlistStorage {
  return {
    get: (keys) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in store) result[key] = store[key];
      }
      return Promise.resolve(result);
    },
    set: (items) => {
      Object.assign(store, items);
      return Promise.resolve();
    },
  };
}

describe("listTopics", () => {
  it("returns an empty array when nothing is stored", async () => {
    const storage = createFakeStorage();

    const topics = await listTopics(storage);

    expect(topics).toEqual([]);
  });

  it("returns topics already present in storage", async () => {
    const storage = createFakeStorage({ watchlist: ["Lakers vs Celtics 9/19"] });

    const topics = await listTopics(storage);

    expect(topics).toEqual(["Lakers vs Celtics 9/19"]);
  });
});

describe("addTopic", () => {
  it("appends a new topic to an empty watchlist", async () => {
    const storage = createFakeStorage();

    const topics = await addTopic(storage, "The Last of Us S2");

    expect(topics).toEqual(["The Last of Us S2"]);
  });

  it("appends a new topic to an existing watchlist", async () => {
    const storage = createFakeStorage({ watchlist: ["Lakers vs Celtics 9/19"] });

    const topics = await addTopic(storage, "The Last of Us S2");

    expect(topics).toEqual(["Lakers vs Celtics 9/19", "The Last of Us S2"]);
  });
});

describe("removeTopic", () => {
  it("removes an existing topic from the watchlist", async () => {
    const storage = createFakeStorage({
      watchlist: ["Lakers vs Celtics 9/19", "The Last of Us S2"],
    });

    const topics = await removeTopic(storage, "Lakers vs Celtics 9/19");

    expect(topics).toEqual(["The Last of Us S2"]);
  });

  it("leaves the watchlist unchanged when the topic is not present", async () => {
    const storage = createFakeStorage({ watchlist: ["The Last of Us S2"] });

    const topics = await removeTopic(storage, "Not there");

    expect(topics).toEqual(["The Last of Us S2"]);
  });

  it("persists the updated list to storage", async () => {
    const storage = createFakeStorage({
      watchlist: ["Lakers vs Celtics 9/19", "The Last of Us S2"],
    });

    await removeTopic(storage, "Lakers vs Celtics 9/19");
    const topics = await listTopics(storage);

    expect(topics).toEqual(["The Last of Us S2"]);
  });
});

describe("persistence across reload", () => {
  it("keeps added topics visible to a fresh storage handle over the same backing store", async () => {
    const backingStore: Record<string, unknown> = {};
    const beforeReload = createFakeStorage({}, backingStore);
    await addTopic(beforeReload, "The Last of Us S2");

    const afterReload = createFakeStorage({}, backingStore);
    const topics = await listTopics(afterReload);

    expect(topics).toEqual(["The Last of Us S2"]);
  });

  it("keeps removals visible to a fresh storage handle over the same backing store", async () => {
    const backingStore: Record<string, unknown> = {
      watchlist: ["Lakers vs Celtics 9/19", "The Last of Us S2"],
    };
    const beforeReload = createFakeStorage({}, backingStore);
    await removeTopic(beforeReload, "Lakers vs Celtics 9/19");

    const afterReload = createFakeStorage({}, backingStore);
    const topics = await listTopics(afterReload);

    expect(topics).toEqual(["The Last of Us S2"]);
  });
});
