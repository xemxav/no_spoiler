import { addTopic, listTopics, removeTopic } from "./watchlist.js";
import { isEnabled, setEnabled } from "./settings.js";
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

function show(updated: string[]): void {
  topics = updated;
  render();
}

toggle.addEventListener("click", () => {
  enabled = !enabled;
  renderProtection();
  void setEnabled(storage, enabled);
});

form.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();
  const topic = input.value.trim();
  if (!topic) return;
  void addTopic(storage, topic).then((updated) => {
    input.value = "";
    show(updated);
  });
});

void Promise.all([listTopics(storage), isEnabled(storage)]).then(([storedTopics, storedEnabled]) => {
  enabled = storedEnabled;
  show(storedTopics);
});
