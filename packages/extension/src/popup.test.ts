import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BACKEND_URL } from "./config.js";

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
/** The manifest's real host permissions, as the popup reads them at runtime. */
const MANIFEST = {
  host_permissions: [
    "https://x.com/*",
    "https://twitter.com/*",
    "http://localhost:3210/*",
    "https://*.up.railway.app/*",
  ],
  content_scripts: [{ matches: ["https://x.com/*", "https://twitter.com/*"] }],
};

async function openPopup(
  watchlist: string[] = [],
  settings: Record<string, unknown> = {},
  fetchImpl: unknown = vi.fn().mockRejectedValue(new Error("no engine in the test")),
): Promise<Record<string, unknown>> {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
  document.body.innerHTML = popupMarkup();

  const store: Record<string, unknown> = { watchlist: [...watchlist], ...settings };
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
    runtime: { getManifest: () => MANIFEST },
  });
  vi.stubGlobal("fetch", fetchImpl);

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

async function setAddress(url: string): Promise<void> {
  const field = require$<HTMLInputElement>("#backend-url");
  field.value = url;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  await flush();
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

  it("scolds nobody for pressing enter on an empty field", async () => {
    await openPopup([]);

    await typeTopic("   ");

    expect(isShown("topic-error")).toBe(false);
    expect(require$("#topic-input").getAttribute("aria-invalid")).toBeNull();
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

function toggle(): HTMLButtonElement {
  return require$<HTMLButtonElement>("#enabled-toggle");
}

describe("the master switch", () => {
  it("reads as on for a fresh install that has never set it", async () => {
    await openPopup(["Dune 3"]);

    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects a stored off", async () => {
    await openPopup(["Dune 3"], { enabled: false });

    expect(toggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("writes the flag when switched off, leaving the watchlist alone", async () => {
    const store = await openPopup(["Dune 3"]);

    toggle().click();
    await flush();

    expect(store.enabled).toBe(false);
    expect(store.watchlist).toEqual(["Dune 3"]);
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("writes the flag again when switched back on", async () => {
    const store = await openPopup(["Dune 3"], { enabled: false });

    toggle().click();
    await flush();

    expect(store.enabled).toBe(true);
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });

  it("is disabled while the watchlist is empty, because the list is what is stopping it", async () => {
    await openPopup([]);

    expect(toggle().disabled).toBe(true);
  });

  it("becomes usable as soon as a topic is added", async () => {
    await openPopup([]);

    await typeTopic("Dune 3");

    expect(toggle().disabled).toBe(false);
  });

  it("says in words whether protection is running, and why not when it is not", async () => {
    await openPopup([]);
    const state = () => require$("#protection-state").textContent?.trim() ?? "";
    // The switch is not what is stopping it, so the copy blames the list.
    expect(state()).toMatch(/no topics/i);
    expect(toggle().getAttribute("aria-describedby")).toBe("protection-state");

    await openPopup(["Dune 3"], { enabled: false });
    expect(state()).toMatch(/paused|off/i);

    await openPopup(["Dune 3"]);
    expect(state()).toMatch(/active/i);
  });
});

describe("a topic already on the list", () => {
  it("is refused, with a message naming the entry as it is stored", async () => {
    const store = await openPopup(["Dune 3"]);

    await typeTopic("dune 3");

    expect(store.watchlist).toEqual(["Dune 3"]);
    expect(listedTopics()).toEqual(["Dune 3"]);
    expect(isShown("topic-error")).toBe(true);
    expect(require$("#topic-error").textContent).toContain("Dune 3");
  });

  it("leaves what was typed in the field, so it can be edited rather than retyped", async () => {
    await openPopup(["Dune 3"]);

    await typeTopic("dune 3");

    expect(require$<HTMLInputElement>("#topic-input").value).toBe("dune 3");
  });

  it("marks the field invalid and points it at the message", async () => {
    await openPopup(["Dune 3"]);

    await typeTopic("dune 3");

    const input = require$<HTMLInputElement>("#topic-input");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("topic-error");
  });

  it("clears the message as soon as the field is edited", async () => {
    await openPopup(["Dune 3"]);
    await typeTopic("dune 3");

    const input = require$<HTMLInputElement>("#topic-input");
    input.value = "dune 4";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(isShown("topic-error")).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("clears the message once a different topic is accepted", async () => {
    await openPopup(["Dune 3"]);
    await typeTopic("dune 3");

    await typeTopic("Severance S3");

    expect(isShown("topic-error")).toBe(false);
    expect(listedTopics()).toEqual(["Dune 3", "Severance S3"]);
  });
});

function engineStatus(): string {
  return require$("#engine-status").textContent?.trim() ?? "";
}

/** A fetch that reports a round trip of `ms` on the extension's own clock. */
function respondIn(ms: number, response: unknown): ReturnType<typeof vi.fn> {
  let now = 0;
  vi.stubGlobal("performance", { now: () => now });
  return vi.fn().mockImplementation(() => {
    now += ms;
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });
}

describe("the backend address", () => {
  it("shows the build-time default when none has ever been set", async () => {
    await openPopup(["Dune 3"]);

    expect(require$<HTMLInputElement>("#backend-url").value).toBe(DEFAULT_BACKEND_URL);
  });

  it("shows the stored address", async () => {
    await openPopup(["Dune 3"], { backendUrl: "https://engine.up.railway.app" });

    expect(require$<HTMLInputElement>("#backend-url").value).toBe(
      "https://engine.up.railway.app",
    );
  });

  it("stores an address the extension is permitted to reach", async () => {
    const store = await openPopup(["Dune 3"]);

    await setAddress("https://engine.up.railway.app");

    expect(store.backendUrl).toBe("https://engine.up.railway.app");
    expect(isShown("backend-error")).toBe(false);
  });

  it("refuses an address outside the declared host permissions, and says why", async () => {
    const store = await openPopup(["Dune 3"]);

    await setAddress("https://engine.example.com");

    expect(store.backendUrl).toBeUndefined();
    expect(isShown("backend-error")).toBe(true);
    expect(require$("#backend-error").textContent).toMatch(/not allowed to reach/i);
    // Naming what it can reach is the difference between an explanation and a refusal.
    expect(require$("#backend-error").textContent).toContain("up.railway.app");
  });

  it("refuses something that is not an address at all", async () => {
    const store = await openPopup(["Dune 3"]);

    await setAddress("not a url");

    expect(store.backendUrl).toBeUndefined();
    expect(isShown("backend-error")).toBe(true);
  });

  it("clears the refusal once the address is edited", async () => {
    await openPopup(["Dune 3"]);
    await setAddress("https://engine.example.com");

    const field = require$<HTMLInputElement>("#backend-url");
    field.value = "http://localhost:3210";
    field.dispatchEvent(new Event("input", { bubbles: true }));

    expect(isShown("backend-error")).toBe(false);
  });
});

describe("testing the engine", () => {
  it("reports it reachable, with how long it took", async () => {
    const fetchMock = respondIn(180, { ok: true });
    await openPopup(["Dune 3"], {}, fetchMock);

    require$<HTMLButtonElement>("#engine-test").click();
    await flush();

    expect(engineStatus()).toMatch(/connected/i);
    expect(engineStatus()).toContain("180");
    expect(require$("#engine-dot").getAttribute("data-state")).toBe("ok");
  });

  it("calls the health route, which costs no judgment quota", async () => {
    const fetchMock = respondIn(90, { ok: true });
    await openPopup(["Dune 3"], { backendUrl: "http://localhost:3210" }, fetchMock);

    require$<HTMLButtonElement>("#engine-test").click();
    await flush();

    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("http://localhost:3210/health");
  });

  it("reports it slow when it answers but takes its time", async () => {
    const fetchMock = respondIn(1400, { ok: true });
    await openPopup(["Dune 3"], {}, fetchMock);

    require$<HTMLButtonElement>("#engine-test").click();
    await flush();

    expect(engineStatus()).toMatch(/slow/i);
    expect(engineStatus()).toContain("1400");
    expect(require$("#engine-dot").getAttribute("data-state")).toBe("slow");
  });

  it("reports it unreachable when the request fails", async () => {
    const fetchMock = respondIn(50, new Error("connection refused"));
    await openPopup(["Dune 3"], {}, fetchMock);

    require$<HTMLButtonElement>("#engine-test").click();
    await flush();

    expect(engineStatus()).toMatch(/unreachable/i);
    expect(require$("#engine-dot").getAttribute("data-state")).toBe("down");
  });

  it("reports it unreachable when the health route answers with an error status", async () => {
    const fetchMock = respondIn(50, { ok: false, status: 502 });
    await openPopup(["Dune 3"], {}, fetchMock);

    require$<HTMLButtonElement>("#engine-test").click();
    await flush();

    expect(engineStatus()).toMatch(/unreachable/i);
  });

  it("checks once on opening, so the footer says something before anything is pressed", async () => {
    const fetchMock = respondIn(120, { ok: true });
    await openPopup(["Dune 3"], {}, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(engineStatus()).toMatch(/connected/i);
  });

  it("opens the engine panel from the footer, as a disclosure", async () => {
    await openPopup(["Dune 3"]);
    expect(isShown("engine-panel")).toBe(false);

    const disclosure = require$<HTMLButtonElement>("#engine-toggle");
    expect(disclosure.getAttribute("aria-controls")).toBe("engine-panel");
    disclosure.click();

    expect(isShown("engine-panel")).toBe(true);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  });
});
