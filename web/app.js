import { createSaver } from "./save.js";
import { acceptedQueue, loadSuggestions } from "./suggest.js";
import { renderWork } from "./work.js";
import { renderWishlist } from "./wishlist.js";

const OFFLINE = "Not saved — start Journal.bat";
const CONFLICT = "This journal was changed in another tab. Reload to continue.";
const DAMAGED = "Your journal file was damaged and set aside. Restore a copy from data\\backups.";

// suggestions are Claude's, kept in their own file; the saver never sends them.
const state = { version: 0, issues: [], wishlist: [], suggestions: {} };
const tabs = { work: renderWork, wishlist: renderWishlist };
let currentTab = "work";

const view = document.getElementById("view");
const statusEl = document.getElementById("status");
const alertEl = document.getElementById("alert");
const noticeEl = document.getElementById("notice");

const saver = createSaver({
  getData: () => ({ version: state.version, issues: state.issues, wishlist: state.wishlist }),
  onStatus(status, version) {
    if (status === "saved") {
      state.version = version;
      statusEl.textContent = "Saved";
      showAlert(null);
      acceptedQueue.flush();
    } else if (status === "saving") {
      statusEl.textContent = "Saving…";
    } else if (status === "offline") {
      statusEl.textContent = "";
      showAlert(OFFLINE);
    } else if (status === "conflict") {
      statusEl.textContent = "";
      showAlert(CONFLICT);
      view.inert = true; // read-only, so nothing more can be typed and lost
    }
  },
});

function showAlert(text) {
  alertEl.hidden = !text;
  alertEl.textContent = text ?? "";
}

let loaded = false;

function show(tab) {
  currentTab = tab;
  for (const btn of document.querySelectorAll("[data-tab]")) {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  }
  if (!loaded) return; // never let edits happen on placeholder data
  view.replaceChildren();
  view.dataset.tab = tab;
  tabs[tab](view, state, saver.changed);
}

for (const btn of document.querySelectorAll("[data-tab]")) {
  btn.addEventListener("click", () => show(btn.dataset.tab));
}

async function start() {
  try {
    const res = await fetch("/api/data");
    if (!res.ok) throw new Error(`load failed: ${res.status}`);
    const data = await res.json();
    Object.assign(state, { version: data.version, issues: data.issues, wishlist: data.wishlist });
    state.suggestions = await loadSuggestions();
    if (data.damaged) {
      noticeEl.textContent = DAMAGED;
      noticeEl.hidden = false;
    }
    showAlert(null);
    statusEl.textContent = "Saved";
    loaded = true;
    show(currentTab);
  } catch {
    showAlert(OFFLINE);
    setTimeout(start, 10000);
  }
}

// Coming back to an older tab: if it has nothing unsaved, pick up changes saved elsewhere
// instead of running into a conflict on the next edit.
async function refreshIfStale() {
  if (!loaded || document.hidden || !saver.isIdle()) return;
  try {
    const data = await (await fetch("/api/data")).json();
    const suggestions = await loadSuggestions();
    for (const id of Object.keys(suggestions)) {
      if (acceptedQueue.has(id)) delete suggestions[id]; // accepted here, not yet cleared on the server
    }
    const journalMoved = data.version !== state.version;
    const suggestionsMoved = JSON.stringify(suggestions) !== JSON.stringify(state.suggestions);
    if ((journalMoved || suggestionsMoved) && saver.isIdle()) {
      Object.assign(state, { version: data.version, issues: data.issues, wishlist: data.wishlist, suggestions });
      show(currentTab);
    }
  } catch {
    // Server down: the next save will show the offline bar.
  }
}

window.addEventListener("focus", refreshIfStale);
document.addEventListener("visibilitychange", refreshIfStale);

start();
