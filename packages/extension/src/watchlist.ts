export interface WatchlistStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Adapts the real chrome.storage.local API to WatchlistStorage. */
export function createChromeStorage(): WatchlistStorage {
  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (items) => chrome.storage.local.set(items),
  };
}

const STORAGE_KEY = "watchlist";

export async function listTopics(storage: WatchlistStorage): Promise<string[]> {
  const result = await storage.get([STORAGE_KEY]);
  const topics = result[STORAGE_KEY];
  return Array.isArray(topics) ? (topics as string[]) : [];
}

async function mutateTopics(
  storage: WatchlistStorage,
  transform: (topics: string[]) => string[],
): Promise<string[]> {
  const topics = await listTopics(storage);
  const updated = transform(topics);
  await storage.set({ [STORAGE_KEY]: updated });
  return updated;
}

export function addTopic(storage: WatchlistStorage, topic: string): Promise<string[]> {
  return mutateTopics(storage, (topics) => [...topics, topic]);
}

export function removeTopic(storage: WatchlistStorage, topic: string): Promise<string[]> {
  return mutateTopics(storage, (topics) => topics.filter((existing) => existing !== topic));
}
