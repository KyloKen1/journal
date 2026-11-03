import { createSaver } from "./save.js";
import { renderWork } from "./work.js";
import { renderWishlist } from "./wishlist.js";

const OFFLINE = "Not saved — start Journal.bat";
const CONFLICT = "This journal was changed in another tab. Reload to continue.";
const DAMAGED = "Your journal file was damaged and set aside. Restore a copy from data\\backups.";

const state = { version: 0, issues: [], wishlist: [] };
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
    } else if (status === "saving") {
      statusEl.textContent = "Saving…";
    } else if (status === "offline") {
      statusEl.textContent = "";
      showAlert(OFFLINE);
    } else if (status === "conflict") {
      statusEl.textContent = "";
      showAlert(CONFLICT);
    }
  },
});

function showAlert(text) {
  alertEl.hidden = !text;
  alertEl.textContent = text ?? "";
}

function show(tab) {
  currentTab = tab;
  for (const btn of document.querySelectorAll("[data-tab]")) {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  }
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
    if (data.damaged) {
      noticeEl.textContent = DAMAGED;
      noticeEl.hidden = false;
    }
    showAlert(null);
    statusEl.textContent = "Saved";
    show(currentTab);
  } catch {
    showAlert(OFFLINE);
    setTimeout(start, 10000);
  }
}

start();
