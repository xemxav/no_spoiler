import { addTopic, listTopics, removeTopic } from "./watchlist.js";
import { getBackendUrl, isEnabled, setBackendUrl, setEnabled } from "./settings.js";
import { createChromeStorage } from "./storage.js";

const storage = createChromeStorage();

const form = document.getElementById("add-form") as HTMLFormElement;
const input = document.getElementById("topic-input") as HTMLInputElement;
const list = document.getElementById("topic-list") as HTMLUListElement;
const count = document.getElementById("topic-count") as HTMLElement;
const firstRun = document.getElementById("first-run") as HTMLElement;
const idleNote = document.getElementById("idle-note") as HTMLElement;
const listSection = document.getElementById("list-section") as HTMLElement;
const toggle = document.getElementById("enabled-toggle") as HTMLButtonElement;
const protectionState = document.getElementById("protection-state") as HTMLElement;
const fieldError = document.getElementById("topic-error") as HTMLElement;
const fieldErrorText = document.getElementById("topic-error-text") as HTMLElement;
const enginePanel = document.getElementById("engine-panel") as HTMLElement;
const engineToggle = document.getElementById("engine-toggle") as HTMLButtonElement;
const engineTest = document.getElementById("engine-test") as HTMLButtonElement;
const engineStatus = document.getElementById("engine-status") as HTMLElement;
const engineDot = document.getElementById("engine-dot") as HTMLElement;
const backendField = document.getElementById("backend-url") as HTMLInputElement;
const backendError = document.getElementById("backend-error") as HTMLElement;
const backendErrorText = document.getElementById("backend-error-text") as HTMLElement;

/**
 * An engine answering more slowly than this is working but degraded. Where the
 * line falls is a presentation decision, so it lives here rather than in the
 * settings module.
 */
const SLOW_ENGINE_MS = 1000;

const SVG_NS = "http://www.w3.org/2000/svg";

/** What the popup is currently showing. Storage is the record; this is the view. */
let topics: string[] = [];
let enabled = true;

/** A stroke cross on the 24×24 icon grid the design system sets. */
function createRemoveIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M6 6l12 12", "M18 6L6 18"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function createRow(topic: string): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "ns-row";

  const label = document.createElement("span");
  label.className = "ns-row-label";
  label.textContent = topic;
  item.appendChild(label);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ns-row-remove";
  // Naming the topic, not just "Remove": a screen reader user moving through
  // the list hears which row each control belongs to.
  removeButton.setAttribute("aria-label", `Remove ${topic}`);
  removeButton.appendChild(createRemoveIcon());
  removeButton.addEventListener("click", () => {
    void removeTopic(storage, topic).then(show);
  });
  item.appendChild(removeButton);

  return item;
}

/**
 * Two things decide whether anything is filtered, and the popup has to say
 * which. An empty watchlist disables the switch rather than flipping it — the
 * switch is not what is stopping the extension, and the line beside it says so.
 */
function renderProtection(): void {
  const idle = topics.length === 0;
  toggle.setAttribute("aria-pressed", String(enabled));
  toggle.disabled = idle;

  protectionState.textContent = idle
    ? "Idle — no topics yet"
    : enabled
      ? "Protection active on x.com"
      : "Paused — nothing is being filtered";
  protectionState.dataset.state = enabled && !idle ? "running" : "stopped";
}

function render(): void {
  list.replaceChildren(...topics.map(createRow));
  count.textContent = String(topics.length);

  // An empty list means the extension is inert, so the popup explains itself
  // instead of showing an empty box.
  const idle = topics.length === 0;
  firstRun.hidden = !idle;
  idleNote.hidden = !idle;
  listSection.hidden = idle;

  renderProtection();
}

/**
 * Wires the field to the message, or unwires it. `aria-describedby` points at
 * the message only while there is one, so the field is never described by an
 * empty element.
 */
function showFieldError(message: string | null): void {
  if (message === null) {
    fieldError.hidden = true;
    fieldErrorText.textContent = "";
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    return;
  }
  fieldErrorText.textContent = message;
  fieldError.hidden = false;
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", fieldError.id);
}

function show(updated: string[]): void {
  topics = updated;
  render();
}

/**
 * The addresses this extension may use as a backend: the hosts it declares
 * permission for, minus the pages it injects into. Read from the manifest so
 * there is one list, not a copy of it here that can drift.
 */
function backendPatterns(): string[] {
  const manifest = chrome.runtime.getManifest();
  const pages = new Set(
    (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []),
  );
  return (manifest.host_permissions ?? []).filter((pattern: string) => !pages.has(pattern));
}

/**
 * A Chrome match pattern, matched on scheme and host only — the path is always
 * `/*` for a backend, and the address is a origin.
 */
function patternAllows(pattern: string, address: URL): boolean {
  const parsed = /^(\*|https?):\/\/([^/]+)\//.exec(pattern);
  if (!parsed) return false;
  const [, scheme, host] = parsed;

  if (scheme !== "*" && `${scheme}:` !== address.protocol) return false;
  if (host === "*") return true;
  if (host.startsWith("*.")) return address.host.endsWith(host.slice(1));
  return address.host === host;
}

/**
 * Why the address was refused, or null if it is fine. Requesting permission
 * for a host outside the declared patterns at runtime is out of scope, so an
 * address outside them would simply fail every request — saying so beats
 * leaving the user to debug a silent failure.
 */
function reasonToRefuse(value: string): string | null {
  let address: URL;
  try {
    address = new URL(value);
  } catch {
    return "That is not an address the extension can use. It needs a full URL, like http://localhost:3210.";
  }

  const patterns = backendPatterns();
  if (patterns.some((pattern) => patternAllows(pattern, address))) return null;
  return `The extension is not allowed to reach that address. It can only reach ${patterns.join(", ")}.`;
}

function showBackendError(message: string | null): void {
  if (message === null) {
    backendError.hidden = true;
    backendErrorText.textContent = "";
    backendField.removeAttribute("aria-invalid");
    backendField.removeAttribute("aria-describedby");
    return;
  }
  backendErrorText.textContent = message;
  backendError.hidden = false;
  backendField.setAttribute("aria-invalid", "true");
  backendField.setAttribute("aria-describedby", backendError.id);
}

function renderEngine(state: "checking" | "ok" | "slow" | "down", text: string): void {
  engineDot.dataset.state = state;
  engineStatus.textContent = text;
}

/**
 * Calls the engine's health route, which never touches the judgment client, so
 * this can be pressed as often as the user likes.
 */
async function checkEngine(): Promise<void> {
  renderEngine("checking", "Checking the engine…");
  const address = await getBackendUrl(storage);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${address}/health`);
    const elapsed = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      renderEngine("down", "Engine unreachable");
      return;
    }
    renderEngine(
      elapsed >= SLOW_ENGINE_MS ? "slow" : "ok",
      elapsed >= SLOW_ENGINE_MS
        ? `Engine slow · ${elapsed} ms`
        : `Engine connected · ${elapsed} ms`,
    );
  } catch {
    renderEngine("down", "Engine unreachable");
  }
}

engineToggle.addEventListener("click", () => {
  const open = enginePanel.hidden;
  enginePanel.hidden = !open;
  engineToggle.setAttribute("aria-expanded", String(open));
});

// A stale refusal must not outlive the text that caused it.
backendField.addEventListener("input", () => showBackendError(null));

backendField.addEventListener("change", () => {
  const value = backendField.value.trim();
  const refusal = reasonToRefuse(value);
  showBackendError(refusal);
  if (refusal !== null) return;
  void setBackendUrl(storage, value).then(checkEngine);
});

engineTest.addEventListener("click", () => {
  void checkEngine();
});

toggle.addEventListener("click", () => {
  enabled = !enabled;
  renderProtection();
  void setEnabled(storage, enabled);
});

// A stale error must not outlive the text that caused it.
input.addEventListener("input", () => showFieldError(null));

form.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();
  const topic = input.value.trim();
  // Pressing enter on an empty field is a no-op, not something to be told off
  // for, so it clears any message rather than raising one.
  if (!topic) {
    showFieldError(null);
    return;
  }
  void addTopic(storage, topic).then((result) => {
    if (result.added) {
      input.value = "";
      showFieldError(null);
    } else {
      showFieldError(`“${result.duplicateOf}” is already on your watchlist.`);
    }
    show(result.topics);
  });
});

void Promise.all([listTopics(storage), isEnabled(storage), getBackendUrl(storage)]).then(
  ([storedTopics, storedEnabled, storedAddress]) => {
    enabled = storedEnabled;
    backendField.value = storedAddress;
    show(storedTopics);
  },
);

// Story: tell the user whether the engine is reachable without them asking,
// so a quiet feed is distinguishable from a broken setup.
void checkEngine();
