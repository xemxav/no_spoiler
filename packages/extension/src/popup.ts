import { addTopic, createChromeStorage, listTopics, removeTopic } from "./watchlist.js";

const storage = createChromeStorage();

const form = document.getElementById("add-form") as HTMLFormElement;
const input = document.getElementById("topic-input") as HTMLInputElement;
const list = document.getElementById("topic-list") as HTMLUListElement;

function renderTopics(topics: string[]): void {
  list.innerHTML = "";
  for (const topic of topics) {
    const item = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = topic;
    item.appendChild(label);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      void removeTopic(storage, topic).then(renderTopics);
    });
    item.appendChild(removeButton);

    list.appendChild(item);
  }
}

form.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();
  const topic = input.value.trim();
  if (!topic) return;
  void addTopic(storage, topic).then((topics) => {
    input.value = "";
    renderTopics(topics);
  });
});

void listTopics(storage).then(renderTopics);
