import type { ExtensionStorage } from "./storage.js";

const STORAGE_KEY = "watchlist";

export async function listTopics(storage: ExtensionStorage): Promise<string[]> {
  const result = await storage.get([STORAGE_KEY]);
  const topics = result[STORAGE_KEY];
  return Array.isArray(topics) ? (topics as string[]) : [];
}

async function mutateTopics(
  storage: ExtensionStorage,
  transform: (topics: string[]) => string[],
): Promise<string[]> {
  const topics = await listTopics(storage);
  const updated = transform(topics);
  await storage.set({ [STORAGE_KEY]: updated });
  return updated;
}

/**
 * Either the topic went on the list, or an entry matching it was already
 * there. The caller gets both the list to render and the reason, so it never
 * has to re-read storage to find out which happened.
 */
export type AddTopicResult =
  | { added: true; topics: string[] }
  | { added: false; topics: string[]; duplicateOf: string };

/** Two topics are the same subject if they differ only in case or edge whitespace. */
function sameSubject(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * Adds a topic unless the list already holds the same subject. The stored
 * entry keeps the capitalisation the user typed — matching is case-insensitive,
 * the list is not, so it reads back the way they wrote it.
 */
export async function addTopic(
  storage: ExtensionStorage,
  topic: string,
): Promise<AddTopicResult> {
  const topics = await listTopics(storage);
  const duplicateOf = topics.find((existing) => sameSubject(existing, topic));
  if (duplicateOf !== undefined) {
    return { added: false, topics, duplicateOf };
  }
  return { added: true, topics: await mutateTopics(storage, (all) => [...all, topic.trim()]) };
}

export function removeTopic(storage: ExtensionStorage, topic: string): Promise<string[]> {
  return mutateTopics(storage, (topics) => topics.filter((existing) => existing !== topic));
}
