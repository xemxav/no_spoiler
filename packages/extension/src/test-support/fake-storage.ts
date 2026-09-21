import type { ExtensionStorage } from "../storage.js";

/**
 * An in-memory ExtensionStorage. Pass `store` explicitly to hand two handles
 * the same backing object, which is how the suites model a browser restart.
 */
export function createFakeStorage(
  initial: Record<string, unknown> = {},
  store: Record<string, unknown> = { ...initial },
): ExtensionStorage {
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
