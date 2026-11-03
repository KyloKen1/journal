// Autosave: debounces edits, PUTs the whole journal, retries while the server is down,
// and stops for good if another tab saved a newer version.

const DEBOUNCE_MS = 1000;
const RETRY_MS = 10000;

export function createSaver({ getData, onStatus }) {
  let timer = null;
  let retryTimer = null;
  let pending = false;
  let inFlight = false;
  let stopped = false;

  function changed() {
    pending = true; // after a conflict this still arms the leave-page prompt
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  async function flush() {
    if (stopped || inFlight || !pending) return;
    inFlight = true;
    pending = false;
    onStatus("saving");
    try {
      const res = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getData()),
      });
      if (res.status === 409) {
        stopped = true;
        pending = true; // this edit was not saved
        clearInterval(retryTimer);
        onStatus("conflict");
        return;
      }
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      const { version } = await res.json();
      clearInterval(retryTimer);
      retryTimer = null;
      onStatus("saved", version);
    } catch {
      pending = true;
      onStatus("offline");
      retryTimer ??= setInterval(flush, RETRY_MS);
    } finally {
      inFlight = false;
      // Edits made while this save was in flight still need saving.
      if (pending && !stopped && !retryTimer) flush();
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (pending || inFlight) e.preventDefault();
  });

  // True when every edit is saved and saving still works.
  const isIdle = () => !pending && !inFlight && !stopped;

  return { changed, isIdle };
}
