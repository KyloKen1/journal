import { renderBooks } from "./books.js";
import { normalizeBooks } from "./books-model.js";
import { BOOKS_PATH, DATA_REPO, JOURNAL_PATH, SUGGESTIONS_PATH } from "./config.js";
import { createStorage } from "./github.js";
import { createDirtySave } from "./journal-save.js";
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
const MISSING = "The list file (journal.json) is missing from the data repo. Restore it from the repo's history, then reload.";
const BAD_TOKEN = "GitHub did not accept this device's token. Enter a new one.";
const RETRY_LOAD_MS = 10000;

// sha is the version of journal.json this page last loaded or saved.
// Suggestions are Claude's, kept in their own file; the saver never sends them.
// Books live in their own file (booksSha is its version; null until the file exists).
const state = { sha: null, todos: [], wishlist: [], suggestions: {}, todoSuggestions: {}, books: [], booksSha: null };
const tabs = { todo: renderTodo, wishlist: renderWishlist, books: renderBooks };
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

const files = createDirtySave(storage, {
  journal: {
    path: JOURNAL_PATH,
    data: () => ({ todos: state.todos, wishlist: state.wishlist }),
    getSha: () => state.sha,
    setSha: (sha) => { state.sha = sha; },
  },
  books: {
    path: BOOKS_PATH,
    data: () => ({ books: state.books }),
    getSha: () => state.booksSha,
    setSha: (sha) => { state.booksSha = sha; },
  },
});

const saver = createSaver({
  save: files.save,
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
  tabs[tab](view, state, tab === "books" ? booksChanged : journalChanged);
}

function journalChanged() {
  files.mark("journal");
  saver.changed();
}

function booksChanged() {
  files.mark("books");
  saver.changed();
}

// books.json does not exist until the first book is saved.
async function loadBooks() {
  try {
    const file = await storage.load(BOOKS_PATH);
    return { books: normalizeBooks(file.data), sha: file.sha };
  } catch (error) {
    if (error.kind === "missing") return { books: [], sha: null };
    throw error;
  }
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
function showUnreadable(text = UNREADABLE) {
  noticeEl.textContent = text;
  noticeEl.hidden = false;
  view.inert = true;
}

async function start() {
  if (!getToken()) {
    showSetup(null, start);
    return;
  }
  forgetEl.hidden = false;
  let file, books;
  try {
    file = await storage.load(JOURNAL_PATH);
    books = await loadBooks();
  } catch (error) {
    if (!error.kind) { showUnreadable(); return; } // books.json is not in a shape we understand
    if (error.kind === "auth") showSetup(BAD_TOKEN, start);
    else if (error.kind === "invalid") showUnreadable();
    else if (error.kind === "missing") showUnreadable(MISSING);
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
    books: books.books, booksSha: books.sha,
  });
  showAlert(null);
  statusEl.textContent = "Saved";
  loaded = true;
  show(currentTab);
  // First load of the old Work-card file: save it back in the to-do shape.
  if (journal.todos !== file.data.todos) journalChanged();
}

// Coming back to this tab or device: if it has nothing unsaved, pick up changes saved
// elsewhere instead of running into a conflict on the next edit.
async function refreshIfStale() {
  if (!loaded || document.hidden || !saver.isIdle()) return;
  const shaBefore = state.sha;
  const booksShaBefore = state.booksSha;
  try {
    const file = await storage.load(JOURNAL_PATH);
    const journal = normalizeJournal(file.data);
    const books = await loadBooks();
    const suggestions = await loadSuggestions();
    // An edit was saved from this page while we were loading: the copy we fetched may be
    // the older one, so it must not replace what is on screen.
    if (state.sha !== shaBefore || state.booksSha !== booksShaBefore) return;
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
    const booksMoved = books.sha !== state.booksSha;
    if ((journalMoved || suggestionsMoved || booksMoved) && saver.isIdle()) {
      if (booksMoved) Object.assign(state, { books: books.books, booksSha: books.sha });
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
