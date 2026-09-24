import type { ExtensionStorage } from "./storage.js";
import { DEFAULT_BACKEND_URL } from "./config.js";

const ENABLED_KEY = "enabled";
const BACKEND_URL_KEY = "backendUrl";

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

/**
 * Callers build paths by appending "/judge" or "/health", so an address that
 * ends in a slash would produce "//judge" — a path no route matches, failing
 * every request silently. Normalise on the way in and on the way out, so an
 * address stored before this rule existed is fixed too.
 */
function normaliseAddress(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Where the judgment engine lives. Falls back to the build-time default, so a
 * fresh install works out of the box without anyone opening the popup.
 */
export async function getBackendUrl(storage: ExtensionStorage): Promise<string> {
  const result = await storage.get([BACKEND_URL_KEY]);
  const stored = result[BACKEND_URL_KEY];
  if (typeof stored !== "string" || stored.trim() === "") {
    return normaliseAddress(DEFAULT_BACKEND_URL);
  }
  return normaliseAddress(stored);
}

export async function setBackendUrl(storage: ExtensionStorage, url: string): Promise<void> {
  await storage.set({ [BACKEND_URL_KEY]: normaliseAddress(url) });
}
