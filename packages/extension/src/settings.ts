import type { ExtensionStorage } from "./storage.js";

const ENABLED_KEY = "enabled";

/**
 * Whether the extension is filtering at all. Defaults to on: a fresh install
 * that has never touched the switch should protect the feed.
 */
export async function isEnabled(storage: ExtensionStorage): Promise<boolean> {
  const result = await storage.get([ENABLED_KEY]);
  const enabled = result[ENABLED_KEY];
  return typeof enabled === "boolean" ? enabled : true;
}

export async function setEnabled(storage: ExtensionStorage, enabled: boolean): Promise<void> {
  await storage.set({ [ENABLED_KEY]: enabled });
}
