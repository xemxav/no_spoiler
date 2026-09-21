/**
 * The key-value store the extension's own state lives in. Watchlist and
 * settings both sit on top of this rather than on each other, and a test can
 * stand an in-memory object in for it.
 */
export interface ExtensionStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Adapts the real chrome.storage.local API to ExtensionStorage. */
export function createChromeStorage(): ExtensionStorage {
  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (items) => chrome.storage.local.set(items),
  };
}
