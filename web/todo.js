import { el } from "./dom.js";

// Placeholder until the To-Do tab is built.
export function renderTodo(root) {
  root.append(el("p", { class: "muted empty" }, "To-Do"));
}
