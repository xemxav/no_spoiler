import { describe, expect, it } from "vitest";
import { isEnabled, setEnabled } from "./settings.js";
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
