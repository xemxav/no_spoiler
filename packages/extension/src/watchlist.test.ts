import { describe, expect, it } from "vitest";
import { addTopic, listTopics, removeTopic } from "./watchlist.js";
import { createFakeStorage } from "./test-support/fake-storage.js";

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

    const result = await addTopic(storage, "The Last of Us S2");

    expect(result).toEqual({ added: true, topics: ["The Last of Us S2"] });
  });

  it("appends a new topic to an existing watchlist", async () => {
    const storage = createFakeStorage({ watchlist: ["Lakers vs Celtics 9/19"] });

    const result = await addTopic(storage, "The Last of Us S2");

    expect(result.topics).toEqual(["Lakers vs Celtics 9/19", "The Last of Us S2"]);
  });
});

describe("addTopic refusing a duplicate", () => {
  it("refuses a topic already on the list", async () => {
    const storage = createFakeStorage({ watchlist: ["Dune 3"] });

    const result = await addTopic(storage, "Dune 3");

    expect(result).toEqual({ added: false, topics: ["Dune 3"], duplicateOf: "Dune 3" });
  });

  it("ignores letter case when comparing", async () => {
    const storage = createFakeStorage({ watchlist: ["Dune 3"] });

    const result = await addTopic(storage, "dune 3");

    expect(result.added).toBe(false);
    expect(result.topics).toEqual(["Dune 3"]);
  });

  it("trims surrounding whitespace before comparing", async () => {
    const storage = createFakeStorage({ watchlist: ["Dune 3"] });

    const result = await addTopic(storage, "  Dune 3 ");

    expect(result.added).toBe(false);
    expect(result.topics).toEqual(["Dune 3"]);
  });

  it("names the entry it matched, as that entry is stored", async () => {
    const storage = createFakeStorage({ watchlist: ["Dune 3"] });

    const result = await addTopic(storage, "DUNE 3");

    expect(result.added).toBe(false);
    expect(result.duplicateOf).toBe("Dune 3");
  });

  it("stores an accepted topic with the capitalisation the user typed", async () => {
    const storage = createFakeStorage({ watchlist: ["Dune 3"] });

    const result = await addTopic(storage, "iPhone 18 keynote");

    expect(result.topics).toEqual(["Dune 3", "iPhone 18 keynote"]);
  });

  it("stores an accepted topic without the whitespace around it", async () => {
    const storage = createFakeStorage();

    const result = await addTopic(storage, "  Severance S3  ");

    expect(result.topics).toEqual(["Severance S3"]);
  });

  it("leaves storage untouched when it refuses", async () => {
    const backingStore: Record<string, unknown> = { watchlist: ["Dune 3"] };
    await addTopic(createFakeStorage({}, backingStore), "dune 3");

    expect(backingStore.watchlist).toEqual(["Dune 3"]);
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

  it("keeps matching exactly, since it is only ever driven by a click on a row", async () => {
    const storage = createFakeStorage({ watchlist: ["Dune 3"] });

    const topics = await removeTopic(storage, "dune 3");

    expect(topics).toEqual(["Dune 3"]);
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
