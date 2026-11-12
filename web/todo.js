// The To-Do and Work tabs: a running list with a Completed archive, and a full-window view of one item.
// Both tabs are this one screen, each on its own list.
import { el } from "./dom.js";
import { newId, nowISO, todayISO } from "./format.js";
import { dismissTodoSuggestion, formatCheckedDate, todoAcceptedQueue } from "./suggest.js";
import {
  applySuggestion, carriedOverDays, completeStep, completeTodo, completedTodos, dismissSuggestion,
  moveTodo, newTodo, openTodos, pendingSuggestions, reopenTodo, transferTodo,
} from "./todo-model.js";

// Which item is open in each list survives switching tabs, but not a page reload.
const openIds = {};
// Set while an item is open, so Esc can close it.
let closeOpenItem = null;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !e.isComposing && closeOpenItem) closeOpenItem();
});

const carriedTag = (todo) => {
  const days = todo.completed ? 0 : carriedOverDays(todo, todayISO());
  return days > 0 && el("span", { class: "todo-tag" }, `carried over · ${days} ${days === 1 ? "day" : "days"}`);
};

const removeButton = (onclick) =>
  el("button", { type: "button", class: "remove", title: "Remove", "aria-label": "Remove", onclick }, "×");

// tab is the tab's name in the page; list is the name of its list in the saved data.
// moveTo, when given, is the other list an item can be sent to: { list, label }.
export function renderTodo(root, state, changed, { tab = "todo", list = "todos", moveTo = null } = {}) {
  const showing = () => root.isConnected && root.dataset.tab === tab;
  const todos = () => state[list];

  function touch(todo) {
    todo.updated = nowISO();
    changed();
  }

  function draw() {
    const todo = todos().find((t) => t.id === openIds[list]);
    closeOpenItem = null;
    if (todo) drawItem(todo);
    else drawList();
  }

  function open(id) {
    openIds[list] = id;
    draw();
  }

  // ---- List ----

  function drawList() {
    openIds[list] = null;
    root.dataset.mode = "list";

    function add(input) {
      const title = input.value.trim();
      if (!title) return;
      todos().push(newTodo(title, nowISO()));
      changed();
      draw();
      root.querySelector(".todo-add").focus();
    }

    function setCompleted(todo, completed) {
      if (completed) completeTodo(todo, todayISO());
      else reopenTodo(todo);
      touch(todo);
      const archiveOpen = root.querySelector("details.completed")?.open;
      draw();
      const archive = root.querySelector("details.completed");
      if (archive && archiveOpen) archive.open = true;
    }

    function row(todo) {
      const waiting = pendingSuggestions(todo, state.todoSuggestions).length;
      const li = el("li", { class: todo.completed ? "todo-row is-completed" : "todo-row", "data-id": todo.id },
        !todo.completed && el("button", {
          type: "button", class: "handle", title: "Drag to move, or use the arrow keys",
          "aria-label": `Move ${todo.title || "Untitled"}: drag, or press arrow up or down`,
          onpointerdown: (e) => startDrag(e, li, todo),
          onkeydown: (e) => nudge(e, todo),
        }, "⠿"),
        el("input", {
          type: "checkbox", checked: todo.completed,
          title: todo.completed ? "Move back to the list" : "Mark completed",
          "aria-label": todo.completed ? "Move back to the list" : "Mark completed",
          onchange: (e) => setCompleted(todo, e.target.checked),
        }),
        el("button", { type: "button", class: "todo-open", onclick: () => open(todo.id) },
          el("span", { class: "todo-title" }, todo.title || "Untitled"),
          carriedTag(todo),
          !todo.completed && todo.upNext[0] && el("span", { class: "todo-next" }, todo.upNext[0].text),
          waiting > 0 && el("span", { class: "badge", title: "Claude's suggestions — open the item to see them" },
            waiting === 1 ? "1 suggestion" : `${waiting} suggestions`),
          todo.completed && el("span", { class: "todo-date" }, todo.completedDate ?? ""),
        ),
      );
      return li;
    }

    // Dragging a handle, with the mouse or a finger. The neighbours step around the dragged
    // row, which itself never leaves the page, so the drag is not cut short.
    function startDrag(e, li, todo) {
      if (e.button !== 0) return;
      e.preventDefault(); // no text selection while dragging
      const rows = li.parentElement;
      const middle = (row) => { const r = row.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
      li.classList.add("dragging");

      function onMove(ev) {
        let other;
        while ((other = li.previousElementSibling) && ev.clientY < middle(other)) li.after(other);
        while ((other = li.nextElementSibling) && ev.clientY > middle(other)) li.before(other);
      }

      function onEnd(ev) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        const shown = [...rows.children].map((r) => r.dataset.id).join("\n");
        const moved = shown !== openTodos(todos()).map((t) => t.id).join("\n");
        if (moved && ev.type === "pointerup") {
          moveTodo(todos(), todo.id, li.nextElementSibling?.dataset.id ?? null);
          changed();
        }
        if (showing() && root.dataset.mode === "list") draw();
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    }

    // Arrow up or down on a handle moves the item one place.
    function nudge(e, todo) {
      const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if (!step) return;
      e.preventDefault();
      const open = openTodos(todos());
      const target = open.indexOf(todo) + step;
      if (target < 0 || target >= open.length) return;
      // Up: land before the item above. Down: before the one after the item below, or at the end.
      const before = step < 0 ? open[target] : open[target + 1];
      moveTodo(todos(), todo.id, before?.id ?? null);
      changed();
      draw();
      [...root.querySelectorAll(".todo-rows > .todo-row")].find((r) => r.dataset.id === todo.id)?.querySelector(".handle").focus();
    }

    const active = openTodos(todos());
    const finished = completedTodos(todos());
    root.replaceChildren(
      el("div", { class: "todo-list" },
        el("input", {
          type: "text", class: "todo-add", placeholder: "Add a to-do and press Enter",
          "aria-label": "Add a to-do", enterKeyHint: "done",
          onkeydown: (e) => { if (e.key === "Enter" && !e.isComposing) add(e.target); },
        }),
        active.length
          ? el("ul", { class: "todo-rows" }, active.map(row))
          : el("p", { class: "muted empty" }, "Nothing to do. Add an item above."),
        finished.length > 0 && el("details", { class: "completed" },
          el("summary", {}, `Completed (${finished.length})`),
          el("ul", {}, finished.map(row)),
        ),
      ),
    );
  }

  // ---- One item ----

  function drawItem(todo) {
    root.dataset.mode = "item";
    closeOpenItem = () => { if (showing()) open(null); };

    const upNextEl = el("section", { class: "panel up-next" });
    const progressEl = el("section", { class: "panel progress" });
    const suggestEl = el("section", { class: "panel suggest-col" });

    // Enter in an add box adds the entry, redraws that section and puts the cursor back.
    function addInput(cls, placeholder, add, redraw) {
      return el("input", {
        type: "text", class: cls, placeholder, "aria-label": placeholder, enterKeyHint: "done",
        onkeydown: (e) => {
          const text = e.target.value.trim();
          if (e.key !== "Enter" || e.isComposing || !text) return;
          add(text);
          touch(todo);
          redraw();
          root.querySelector(`.${cls}`).focus();
        },
      });
    }

    function removeFrom(list, entry, redraw) {
      list.splice(list.indexOf(entry), 1);
      touch(todo);
      redraw();
    }

    function drawUpNext() {
      upNextEl.replaceChildren(
        el("h3", {}, "Up next"),
        el("ul", { class: "steps scroll" },
          todo.upNext.map((step) =>
            el("li", {},
              el("input", {
                type: "checkbox", title: "Done — move to Progress", "aria-label": "Done — move to Progress",
                onchange: () => { completeStep(todo, step, todayISO()); touch(todo); drawUpNext(); drawProgress(); },
              }),
              el("input", {
                type: "text", value: step.text, "aria-label": "Up next step",
                oninput: (e) => { step.text = e.target.value; touch(todo); },
              }),
              removeButton(() => removeFrom(todo.upNext, step, drawUpNext)),
            ),
          ),
        ),
        addInput("add-step", "Add a step and press Enter", (text) => todo.upNext.push({ id: newId(), text }), drawUpNext),
      );
    }

    function drawProgress() {
      progressEl.replaceChildren(
        el("h3", {}, "Progress"),
        addInput("add-progress", "Add what you did and press Enter",
          (text) => todo.progress.unshift({ id: newId(), text, date: todayISO() }), drawProgress),
        el("ul", { class: "done scroll" },
          todo.progress.map((entry) =>
            el("li", {},
              el("span", { class: "date" }, entry.date),
              el("input", {
                type: "text", value: entry.text, "aria-label": "Progress entry",
                oninput: (e) => { entry.text = e.target.value; touch(todo); },
              }),
              removeButton(() => removeFrom(todo.progress, entry, drawProgress)),
            ),
          ),
        ),
      );
    }

    function drawSuggestions() {
      const entry = state.todoSuggestions?.[todo.id];
      const waiting = pendingSuggestions(todo, state.todoSuggestions);

      function accept(suggestion) {
        if (!applySuggestion(todo, entry, suggestion.id)) return;
        touch(todo);
        todoAcceptedQueue.add(`${todo.id}/${suggestion.id}`); // cleared in the data repo once this edit has saved
        drawUpNext();
        drawSuggestions();
      }

      async function dismiss(suggestion, button) {
        button.disabled = true;
        if (await dismissTodoSuggestion(todo.id, suggestion.id)) dismissSuggestion(entry, suggestion.id);
        drawSuggestions();
      }

      suggestEl.replaceChildren(
        el("h3", {}, "Suggestions"),
        waiting.length === 0
          ? el("p", { class: "muted" }, "No suggestions. Claude checks on weekday mornings.")
          : el("div", { class: "scroll suggestion-list" },
              typeof entry.checked === "string" && el("p", { class: "muted checked" }, `Checked ${formatCheckedDate(entry.checked)}`),
              waiting.map((suggestion) => {
                const steps = Array.isArray(suggestion.steps) ? suggestion.steps : [];
                return el("div", { class: "suggestion" },
                  el("p", {}, suggestion.text),
                  steps.length > 0 && el("ul", { class: "suggestion-steps" }, steps.map((s) => el("li", {}, s))),
                  el("div", { class: "suggestion-actions" },
                    steps.length > 0 && el("button", {
                      type: "button", class: "primary suggestion-add", onclick: () => accept(suggestion),
                    }, "Add to Up next"),
                    el("button", {
                      type: "button", class: "suggestion-dismiss", onclick: (e) => dismiss(suggestion, e.target),
                    }, "Dismiss"),
                  ),
                );
              }),
            ),
      );
    }

    function setCompleted(completed) {
      if (completed) {
        completeTodo(todo, todayISO());
        touch(todo);
        open(null);
      } else {
        reopenTodo(todo);
        touch(todo);
        draw();
      }
    }

    function remove() {
      if (!confirm("Delete this item? This can't be undone.")) return;
      todos().splice(todos().indexOf(todo), 1);
      changed();
      open(null);
    }

    // Its suggestions are kept by item id, so they follow it to the other list.
    function moveAcross() {
      if (!transferTodo(todos(), state[moveTo.list], todo)) return;
      changed();
      open(null);
    }

    drawUpNext();
    drawProgress();
    drawSuggestions();

    root.replaceChildren(
      el("div", { class: "item" },
        el("header", { class: "item-head" },
          el("button", { type: "button", class: "item-back", onclick: () => open(null) }, "← Back"),
          el("input", {
            type: "checkbox", class: "item-check", checked: todo.completed,
            title: todo.completed ? "Move back to the list" : "Mark completed",
            "aria-label": todo.completed ? "Move back to the list" : "Mark completed",
            onchange: (e) => setCompleted(e.target.checked),
          }),
          el("input", {
            type: "text", class: "title-input", value: todo.title, placeholder: "Untitled", "aria-label": "Title",
            oninput: (e) => { todo.title = e.target.value; touch(todo); },
          }),
          carriedTag(todo),
          todo.completed && el("span", { class: "todo-tag" }, `completed ${todo.completedDate ?? ""}`),
          moveTo && el("button", { type: "button", class: "item-move", onclick: moveAcross }, moveTo.label),
          el("button", { type: "button", class: "danger item-delete", onclick: remove }, "Delete"),
        ),
        el("section", { class: "panel desc-col" },
          el("h3", {}, "Description"),
          el("textarea", {
            class: "description", value: todo.description, placeholder: "What is this about?", "aria-label": "Description",
            oninput: (e) => { todo.description = e.target.value; touch(todo); },
          }),
        ),
        el("div", { class: "mid-col" }, upNextEl, progressEl),
        suggestEl,
      ),
    );
  }

  draw();
}
