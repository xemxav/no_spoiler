import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest runs with the package root as its cwd (see vitest.config.ts).
const POPUP_HTML = readFileSync(resolve(process.cwd(), "popup.html"), "utf8");

/**
 * The popup's own shipped markup, minus its script tag — the test imports the
 * module itself. Reading the real file is what makes this a test of the popup
 * rather than of a fixture that has drifted away from it.
 */
function popupMarkup(): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(POPUP_HTML);
  if (!body) throw new Error("popup.html has no <body>");
  return body[1].replace(/<script[\s\S]*?<\/script>/g, "");
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Loads a fresh popup module against the shipped markup and a storage fake. */
async function openPopup(watchlist: string[] = []): Promise<Record<string, unknown>> {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
  document.body.innerHTML = popupMarkup();

  const store: Record<string, unknown> = { watchlist: [...watchlist] };
  vi.resetModules();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in store) result[key] = store[key];
          }
          return Promise.resolve(result);
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(store, items);
          return Promise.resolve();
        },
      },
    },
  });

  await import("./popup.js");
  await flush();
  return store;
}

function require$<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`popup markup is missing ${selector}`);
  return element;
}

/** Each row's only text is its topic; the remove control is an icon button. */
function listedTopics(): string[] {
  return [...document.querySelectorAll("#topic-list li")].map(
    (row) => row.textContent?.trim() ?? "",
  );
}

/**
 * jsdom computes no layout, so this reads the attribute the popup sets. That
 * the stylesheet honours it is a browser concern, handled by the `[hidden]`
 * rule in popup.css.
 */
function isShown(id: string): boolean {
  const element = document.getElementById(id);
  if (!element) throw new Error(`popup markup is missing #${id}`);
  return !element.hidden;
}

async function typeTopic(topic: string): Promise<void> {
  require$<HTMLInputElement>("#topic-input").value = topic;
  require$<HTMLFormElement>("#add-form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  await flush();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the watchlist", () => {
  it("lists the topics already in storage", async () => {
    await openPopup(["Dune 3", "Ligue 1"]);

    expect(listedTopics()).toEqual(["Dune 3", "Ligue 1"]);
  });

  it("adds a typed topic to storage and to the list, and clears the field", async () => {
    const store = await openPopup([]);

    await typeTopic("Severance S3");

    expect(store.watchlist).toEqual(["Severance S3"]);
    expect(listedTopics()).toEqual(["Severance S3"]);
    expect(require$<HTMLInputElement>("#topic-input").value).toBe("");
  });

  it("ignores an empty entry", async () => {
    const store = await openPopup([]);

    await typeTopic("   ");

    expect(store.watchlist).toEqual([]);
    expect(listedTopics()).toEqual([]);
  });

  it("removes a topic from storage and from the list", async () => {
    const store = await openPopup(["Dune 3", "Ligue 1"]);

    const remove = document.querySelectorAll<HTMLButtonElement>("#topic-list button");
    remove[0].click();
    await flush();

    expect(store.watchlist).toEqual(["Ligue 1"]);
    expect(listedTopics()).toEqual(["Ligue 1"]);
  });
});

describe("the first-run state", () => {
  it("explains what the extension does, and that nothing is analysed yet", async () => {
    await openPopup([]);

    expect(isShown("first-run")).toBe(true);
    expect(isShown("idle-note")).toBe(true);
    expect(isShown("list-section")).toBe(false);
    expect(document.getElementById("idle-note")?.textContent).toMatch(/analyses nothing/i);
  });

  it("gives way to the list as soon as a topic exists", async () => {
    await openPopup(["Dune 3"]);

    expect(isShown("first-run")).toBe(false);
    expect(isShown("idle-note")).toBe(false);
    expect(isShown("list-section")).toBe(true);
  });

  it("switches over the moment the first topic is added", async () => {
    await openPopup([]);

    await typeTopic("Dune 3");

    expect(isShown("first-run")).toBe(false);
    expect(isShown("list-section")).toBe(true);
  });
});

describe("the accessibility floor", () => {
  it("pairs the topic field with a real label", async () => {
    await openPopup([]);

    const input = require$<HTMLInputElement>("#topic-input");
    const label = document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
    expect(label?.textContent?.trim()).toBeTruthy();
  });

  it("names the topic on every control that only carries an icon", async () => {
    await openPopup(["Dune 3"]);

    for (const button of document.querySelectorAll("button")) {
      const named = button.textContent?.trim() || button.getAttribute("aria-label");
      expect(named).toBeTruthy();
    }
    expect(
      document.querySelector("#topic-list button")?.getAttribute("aria-label"),
    ).toContain("Dune 3");
  });

  it("uses real buttons rather than clickable containers", async () => {
    await openPopup(["Dune 3"]);

    expect(document.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(document.querySelector("#topic-list button")?.tagName).toBe("BUTTON");
  });
});
