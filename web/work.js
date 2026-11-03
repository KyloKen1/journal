import { el } from "./dom.js";
import { newId, nowISO, todayISO } from "./format.js";

// View settings survive switching tabs, but not a page reload.
let selectedId = null;
let query = "";
let showArchived = false;

export function renderWork(root, state, changed) {
  const listEl = el("ul", { class: "issue-items" });
  const detailEl = el("section", { class: "issue-detail" });
  const searchEl = el("input", {
    type: "search", placeholder: "Search titles", value: query, "aria-label": "Search titles",
    oninput: (e) => { query = e.target.value; renderList(); },
  });

  root.append(
    el("div", { class: "work" },
      el("aside", { class: "issue-list" },
        el("button", { type: "button", class: "primary", onclick: addIssue }, "+ New issue"),
        searchEl,
        el("label", { class: "toggle" },
          el("input", {
            type: "checkbox", checked: showArchived,
            onchange: (e) => { showArchived = e.target.checked; renderList(); },
          }),
          "Show archived",
        ),
        listEl,
      ),
      detailEl,
    ),
  );

  const selected = () => state.issues.find((i) => i.id === selectedId);

  function touch(issue) {
    issue.updated = nowISO();
    changed();
    renderList();
  }

  function addIssue() {
    const now = nowISO();
    const issue = {
      id: newId(), title: "New issue", details: "", nextSteps: [], done: [],
      archived: false, created: now, updated: now,
    };
    state.issues.push(issue);
    selectedId = issue.id;
    query = searchEl.value = ""; // otherwise the new card could be filtered out of view
    changed();
    renderList();
    renderDetail();
    const title = detailEl.querySelector(".title-input");
    title.focus();
    title.select();
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const visible = state.issues
      .filter((i) => showArchived || !i.archived)
      .filter((i) => i.title.toLowerCase().includes(q))
      .sort((a, b) => b.updated.localeCompare(a.updated));

    listEl.replaceChildren(
      ...visible.map((issue) =>
        el("li", {},
          el("button", {
            type: "button",
            class: ["issue-item", issue.id === selectedId && "selected", issue.archived && "archived"]
              .filter(Boolean).join(" "),
            onclick: () => { selectedId = issue.id; renderList(); renderDetail(); },
          },
            el("span", { class: "issue-title" }, issue.title || "Untitled"),
            el("span", { class: "issue-meta" },
              `${issue.nextSteps.length} next · updated ${issue.updated.slice(0, 10)}${issue.archived ? " · archived" : ""}`),
          ),
        ),
      ),
    );
    if (visible.length === 0) {
      listEl.append(el("li", { class: "muted empty" }, state.issues.length ? "No matching issues." : "No issues yet."));
    }
  }

  function renderDetail() {
    const issue = selected();
    if (!issue) {
      detailEl.replaceChildren(el("p", { class: "muted empty" }, "Select an issue, or create a new one."));
      return;
    }

    detailEl.replaceChildren(
      el("input", {
        type: "text", class: "title-input", value: issue.title, "aria-label": "Title",
        oninput: (e) => { issue.title = e.target.value; touch(issue); },
      }),
      el("p", { class: "muted dates" }, `Created ${issue.created.slice(0, 10)}`),

      el("h3", {}, "Details"),
      el("textarea", {
        class: "details", value: issue.details, rows: 8, placeholder: "What is the issue?",
        oninput: (e) => { issue.details = e.target.value; touch(issue); },
      }),

      el("h3", {}, "Next steps"),
      el("ul", { class: "steps" },
        issue.nextSteps.map((step) =>
          el("li", {},
            el("input", {
              type: "checkbox", title: "Mark done", "aria-label": "Mark done",
              onchange: () => completeStep(issue, step),
            }),
            el("input", {
              type: "text", value: step.text, "aria-label": "Next step",
              oninput: (e) => { step.text = e.target.value; touch(issue); },
            }),
            removeButton(() => removeFrom(issue, "nextSteps", step)),
          ),
        ),
      ),
      addInput("Add a next step and press Enter", "add-step", (text) => {
        issue.nextSteps.push({ id: newId(), text });
      }),

      el("h3", {}, "Done"),
      addInput("Add something you did and press Enter", "add-done", (text) => {
        issue.done.unshift({ id: newId(), text, date: todayISO() });
      }),
      el("ul", { class: "done" },
        issue.done.map((item) =>
          el("li", {},
            el("span", { class: "date" }, item.date),
            el("input", {
              type: "text", value: item.text, "aria-label": "Done item",
              oninput: (e) => { item.text = e.target.value; touch(issue); },
            }),
            removeButton(() => removeFrom(issue, "done", item)),
          ),
        ),
      ),

      el("div", { class: "actions" },
        el("button", {
          type: "button",
          onclick: () => { issue.archived = !issue.archived; touch(issue); renderDetail(); },
        }, issue.archived ? "Unarchive" : "Archive"),
        el("button", {
          type: "button", class: "danger",
          onclick: () => {
            if (!confirm("Delete this issue? This can't be undone.")) return;
            state.issues.splice(state.issues.indexOf(issue), 1);
            selectedId = null;
            changed();
            renderList();
            renderDetail();
          },
        }, "Delete"),
      ),
    );

    function addInput(placeholder, cls, add) {
      return el("input", {
        type: "text", class: cls, placeholder, "aria-label": placeholder,
        onkeydown: (e) => {
          const text = e.target.value.trim();
          if (e.key !== "Enter" || !text) return;
          add(text);
          touch(issue);
          renderDetail();
          detailEl.querySelector(`.${cls}`).focus();
        },
      });
    }

    function removeButton(onclick) {
      return el("button", { type: "button", class: "remove", title: "Remove", "aria-label": "Remove", onclick }, "×");
    }
  }

  function completeStep(issue, step) {
    issue.nextSteps.splice(issue.nextSteps.indexOf(step), 1);
    issue.done.unshift({ id: step.id, text: step.text, date: todayISO() });
    touch(issue);
    renderDetail();
  }

  function removeFrom(issue, key, item) {
    issue[key].splice(issue[key].indexOf(item), 1);
    touch(issue);
    renderDetail();
  }

  renderList();
  renderDetail();
}
