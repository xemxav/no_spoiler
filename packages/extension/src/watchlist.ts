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

export function addTopic(storage: ExtensionStorage, topic: string): Promise<string[]> {
  return mutateTopics(storage, (topics) => [...topics, topic]);
}

export function removeTopic(storage: ExtensionStorage, topic: string): Promise<string[]> {
  return mutateTopics(storage, (topics) => topics.filter((existing) => existing !== topic));
}
