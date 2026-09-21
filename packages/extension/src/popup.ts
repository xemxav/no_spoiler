import { addTopic, listTopics, removeTopic } from "./watchlist.js";
import { getBackendUrl, isEnabled, setBackendUrl, setEnabled } from "./settings.js";
import { createChromeStorage } from "./storage.js";
import { reasonToRefuse } from "./host-permissions.js";

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

/**
 * A socket that is accepted and then never answered would otherwise leave the
 * status line saying "checking" for as long as the popup is open — which is
 * the failure the status line exists to report.
 */
const ENGINE_TIMEOUT_MS = 5000;

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

/** A field, its message and the element the message is written into. */
interface ErrorSlot {
  field: HTMLInputElement;
  message: HTMLElement;
  text: HTMLElement;
}

const topicSlot: ErrorSlot = { field: input, message: fieldError, text: fieldErrorText };
const addressSlot: ErrorSlot = {
  field: backendField,
  message: backendError,
  text: backendErrorText,
};

/**
 * Wires a field to its message, or unwires it. `aria-describedby` points at
 * the message only while there is one, so a field is never described by an
 * empty element.
 */
function showError(slot: ErrorSlot, message: string | null): void {
  if (message === null) {
    slot.message.hidden = true;
    slot.text.textContent = "";
    slot.field.removeAttribute("aria-invalid");
    slot.field.removeAttribute("aria-describedby");
    return;
  }
  slot.text.textContent = message;
  slot.message.hidden = false;
  slot.field.setAttribute("aria-invalid", "true");
  slot.field.setAttribute("aria-describedby", slot.message.id);
}

function show(updated: string[]): void {
  topics = updated;
  render();
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
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), ENGINE_TIMEOUT_MS);
  try {
    const response = await fetch(`${address}/health`, { signal: deadline.signal });
    const elapsed = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      renderEngine("down", "Engine unreachable");
      return;
    }
    const slow = elapsed >= SLOW_ENGINE_MS;
    renderEngine(
      slow ? "slow" : "ok",
      slow ? `Engine slow · ${elapsed} ms` : `Engine connected · ${elapsed} ms`,
    );
  } catch {
    renderEngine("down", "Engine unreachable");
  } finally {
    clearTimeout(timer);
  }
}

engineToggle.addEventListener("click", () => {
  const open = enginePanel.hidden;
  enginePanel.hidden = !open;
  engineToggle.setAttribute("aria-expanded", String(open));
});

// A stale refusal must not outlive the text that caused it.
backendField.addEventListener("input", () => showError(addressSlot, null));

/** Stores the typed address if it is one the extension may use. */
function saveAddress(): Promise<void> | undefined {
  const value = backendField.value.trim();
  const refusal = reasonToRefuse(value);
  showError(addressSlot, refusal);
  if (refusal !== null) return undefined;
  return setBackendUrl(storage, value);
}

backendField.addEventListener("change", () => {
  void saveAddress()?.then(checkEngine);
});

// Closing the popup fires no `change`, so an address typed and never blurred
// would be discarded — and the user would have no way to tell.
window.addEventListener("pagehide", () => {
  void saveAddress();
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
input.addEventListener("input", () => showError(topicSlot, null));

form.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();
  const topic = input.value.trim();
  // Pressing enter on an empty field is a no-op, not something to be told off
  // for, so it clears any message rather than raising one.
  if (!topic) {
    showError(topicSlot, null);
    return;
  }
  void addTopic(storage, topic).then((result) => {
    if (result.added) {
      input.value = "";
      showError(topicSlot, null);
    } else {
      showError(topicSlot, `“${result.duplicateOf}” is already on your watchlist.`);
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
