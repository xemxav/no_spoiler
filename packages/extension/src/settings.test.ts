import { describe, expect, it } from "vitest";
import { getBackendUrl, isEnabled, setBackendUrl, setEnabled } from "./settings.js";
import { DEFAULT_BACKEND_URL } from "./config.js";
import { createFakeStorage } from "./test-support/fake-storage.js";

describe("the enabled flag", () => {
  it("is on for a fresh install that has never set it", async () => {
    const storage = createFakeStorage();

    expect(await isEnabled(storage)).toBe(true);
  });

  it("reads a stored off", async () => {
    const storage = createFakeStorage({ enabled: false });

    expect(await isEnabled(storage)).toBe(false);
  });

  it("survives a browser restart once switched off", async () => {
    const backingStore: Record<string, unknown> = {};
    await setEnabled(createFakeStorage({}, backingStore), false);

    expect(await isEnabled(createFakeStorage({}, backingStore))).toBe(false);
  });

  it("survives a browser restart once switched back on", async () => {
    const backingStore: Record<string, unknown> = { enabled: false };
    await setEnabled(createFakeStorage({}, backingStore), true);

    expect(await isEnabled(createFakeStorage({}, backingStore))).toBe(true);
  });

  it("leaves the watchlist alone", async () => {
    const backingStore: Record<string, unknown> = { watchlist: ["Dune 3"] };
    await setEnabled(createFakeStorage({}, backingStore), false);

    expect(backingStore.watchlist).toEqual(["Dune 3"]);
  });
});

describe("the backend address", () => {
  it("falls back to the build-time default on a fresh install", async () => {
    const storage = createFakeStorage();

    expect(await getBackendUrl(storage)).toBe(DEFAULT_BACKEND_URL);
  });

  it("reads a stored address", async () => {
    const storage = createFakeStorage({ backendUrl: "https://engine.up.railway.app" });

    expect(await getBackendUrl(storage)).toBe("https://engine.up.railway.app");
  });

  it("falls back to the default when what is stored is blank", async () => {
    const storage = createFakeStorage({ backendUrl: "   " });

    expect(await getBackendUrl(storage)).toBe(DEFAULT_BACKEND_URL);
  });

  it("survives a browser restart", async () => {
    const backingStore: Record<string, unknown> = {};
    await setBackendUrl(createFakeStorage({}, backingStore), "https://engine.up.railway.app");

    expect(await getBackendUrl(createFakeStorage({}, backingStore))).toBe(
      "https://engine.up.railway.app",
    );
  });

  it("drops a trailing slash, so the paths built from it are not doubled", async () => {
    const backingStore: Record<string, unknown> = {};
    await setBackendUrl(createFakeStorage({}, backingStore), "http://localhost:3210/");

    expect(await getBackendUrl(createFakeStorage({}, backingStore))).toBe("http://localhost:3210");
  });

  it("drops a trailing slash from an address stored before that rule existed", async () => {
    const storage = createFakeStorage({ backendUrl: "https://engine.up.railway.app/" });

    expect(await getBackendUrl(storage)).toBe("https://engine.up.railway.app");
  });

  it("stores the address without the whitespace around it", async () => {
    const backingStore: Record<string, unknown> = {};
    await setBackendUrl(createFakeStorage({}, backingStore), "  http://localhost:3210  ");

    expect(await getBackendUrl(createFakeStorage({}, backingStore))).toBe("http://localhost:3210");
  });
});
