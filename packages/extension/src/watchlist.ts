export interface WatchlistStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const STORAGE_KEY = "watchlist";

export async function listTopics(storage: WatchlistStorage): Promise<string[]> {
  const result = await storage.get([STORAGE_KEY]);
  const topics = result[STORAGE_KEY];
  return Array.isArray(topics) ? (topics as string[]) : [];
}

export async function addTopic(storage: WatchlistStorage, topic: string): Promise<string[]> {
  const topics = await listTopics(storage);
  const updated = [...topics, topic];
  await storage.set({ [STORAGE_KEY]: updated });
  return updated;
}

export async function removeTopic(storage: WatchlistStorage, topic: string): Promise<string[]> {
  const topics = await listTopics(storage);
  const updated = topics.filter((existing) => existing !== topic);
  await storage.set({ [STORAGE_KEY]: updated });
  return updated;
}
