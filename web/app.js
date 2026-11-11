import { DATA_REPO, JOURNAL_PATH, SUGGESTIONS_PATH } from "./config.js";
import { createStorage } from "./github.js";
import { saveChecked } from "./journal-save.js";
import { createSaver } from "./save.js";
import { acceptedQueue, initSuggestions, loadSuggestions, todoAcceptedQueue } from "./suggest.js";
import { createSuggestionStore } from "./suggest-store.js";
import { normalizeJournal } from "./todo-model.js";
import { forgetToken, getToken, renderSetup } from "./token.js";
import { renderTodo } from "./todo.js";
import { renderWishlist } from "./wishlist.js";

const OFFLINE = "Not saved — no connection. Retrying.";
const LOAD_OFFLINE = "Can't reach GitHub — no connection. Retrying.";
const CONFLICT = "This list was changed on another device. Reload to continue.";
const UNREADABLE = "The saved list could not be read.";
const BAD_TOKEN = "GitHub did not accept this device's token. Enter a new one.";
const RETRY_LOAD_MS = 10000;

// sha is the version of journal.json this page last loaded or saved.
// Suggestions are Claude's, kept in their own file; the saver never sends them.
const state = { sha: null, todos: [], wishlist: [], suggestions: {}, todoSuggestions: {} };
const tabs = { todo: renderTodo, wishlist: renderWishlist };
let currentTab = "todo";
let loaded = false;

const view = document.getElementById("view");
const setupEl = document.getElementById("setup");
const statusEl = document.getElementById("status");
const alertEl = document.getElementById("alert");
const noticeEl = document.getElementById("notice");
const forgetEl = document.getElementById("forget");

const storage = createStorage({ repo: DATA_REPO, getToken });
initSuggestions(createSuggestionStore({ storage, path: SUGGESTIONS_PATH }));

const saver = createSaver({
  save: async () => {
    state.sha = await saveChecked(storage, JOURNAL_PATH, { todos: state.todos, wishlist: state.wishlist }, state.sha);
  },
  onStatus(status, error) {
    statusEl.textContent = status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "";
    if (status === "saved") {
      showAlert(null);
      acceptedQueue.flush();
      todoAcceptedQueue.flush();
    } else if (status === "offline") {
      showAlert(OFFLINE);
    } else if (status === "error") {
      showAlert(`Not saved — GitHub error ${error.status ?? "unknown"}. Retrying.`);
    } else if (status === "conflict") {
      showAlert(CONFLICT);
      view.inert = true; // read-only, so nothing more can be typed and lost
    } else if (status === "auth") {
      // Keep the unsaved edits on the page; save them once a working token is entered.
      view.inert = true;
      showSetup(BAD_TOKEN, () => {
        view.inert = false;
        saver.resume();
      });
    }
  },
});

function showAlert(text) {
  alertEl.hidden = !text;
  alertEl.textContent = text ?? "";
}

function showSetup(message, onSaved) {
  forgetEl.hidden = true;
  setupEl.hidden = false;
  renderSetup(setupEl, {
    message,
    onSaved() {
      setupEl.hidden = true;
      setupEl.replaceChildren();
      forgetEl.hidden = false;
      onSaved();
    },
  });
}

function show(tab) {
  currentTab = tab;
  for (const btn of document.querySelectorAll("[data-tab]")) {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  }
  if (!loaded) return; // never let edits happen on placeholder data
  view.replaceChildren();
  delete view.dataset.mode; // the To-Do tab sets it again; other tabs must not inherit its layout
  view.dataset.tab = tab;
  tabs[tab](view, state, saver.changed);
}

for (const btn of document.querySelectorAll("[data-tab]")) {
  btn.addEventListener("click", () => show(btn.dataset.tab));
}

forgetEl.addEventListener("click", () => {
  if (!confirm("Remove the access token from this device? You will need to enter one again to see your list.")) return;
  forgetToken();
  location.reload();
});

// The file could not be understood: show nothing editable and never save over it.
function showUnreadable() {
  noticeEl.textContent = UNREADABLE;
  noticeEl.hidden = false;
  view.inert = true;
}

async function start() {
  if (!getToken()) {
    showSetup(null, start);
    return;
  }
  forgetEl.hidden = false;
  let file;
  try {
    file = await storage.load(JOURNAL_PATH);
  } catch (error) {
    if (error.kind === "auth") showSetup(BAD_TOKEN, start);
    else if (error.kind === "invalid") showUnreadable();
    else {
      showAlert(error.kind === "offline" ? LOAD_OFFLINE : `Can't load the list — GitHub error ${error.status}. Retrying.`);
      setTimeout(start, RETRY_LOAD_MS);
    }
    return;
  }
  let journal;
  try {
    journal = normalizeJournal(file.data);
  } catch {
    showUnreadable();
    return;
  }
  const suggestions = await loadSuggestions();
  Object.assign(state, {
    sha: file.sha, todos: journal.todos, wishlist: journal.wishlist,
    suggestions: suggestions.items, todoSuggestions: suggestions.todos,
  });
  showAlert(null);
  statusEl.textContent = "Saved";
  loaded = true;
  show(currentTab);
  // First load of the old Work-card file: save it back in the to-do shape.
  if (journal.todos !== file.data.todos) saver.changed();
}

// Coming back to this tab or device: if it has nothing unsaved, pick up changes saved
// elsewhere instead of running into a conflict on the next edit.
async function refreshIfStale() {
  if (!loaded || document.hidden || !saver.isIdle()) return;
  try {
    const file = await storage.load(JOURNAL_PATH);
    const journal = normalizeJournal(file.data);
    const suggestions = await loadSuggestions();
    // Accepted here but not yet cleared in the data repo: keep them hidden.
    for (const id of Object.keys(suggestions.items)) {
      if (acceptedQueue.has(id)) delete suggestions.items[id];
    }
    for (const [todoId, entry] of Object.entries(suggestions.todos)) {
      if (Array.isArray(entry?.suggestions)) {
        entry.suggestions = entry.suggestions.filter((s) => !todoAcceptedQueue.has(`${todoId}/${s.id}`));
      }
    }
    const journalMoved = file.sha !== state.sha;
    const suggestionsMoved =
      JSON.stringify([suggestions.items, suggestions.todos]) !== JSON.stringify([state.suggestions, state.todoSuggestions]);
    if ((journalMoved || suggestionsMoved) && saver.isIdle()) {
      if (journalMoved) Object.assign(state, { sha: file.sha, todos: journal.todos, wishlist: journal.wishlist });
      Object.assign(state, { suggestions: suggestions.items, todoSuggestions: suggestions.todos });
      show(currentTab);
    }
  } catch {
    // Unreachable or unreadable right now: the next save will report it.
  }
}

window.addEventListener("focus", refreshIfStale);
document.addEventListener("visibilitychange", refreshIfStale);

show(currentTab);
start();
