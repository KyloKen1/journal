// Autosave: waits for a pause in editing, then calls save(). Retries while GitHub can't be
// reached, pauses when the token is rejected, and stops for good if the list was changed
// on another device.

export function createSaver({ save, onStatus, debounceMs = 3000, retryMs = 10000 }) {
  let timer = null;
  let retryTimer = null;
  let pending = false;
  let inFlight = false;
  let stopped = false; // conflict: never save again from this page
  let paused = false; // token rejected: wait for resume()

  function stopRetrying() {
    clearInterval(retryTimer);
    retryTimer = null;
  }

  function changed() {
    pending = true; // after a conflict this still arms the leave-page prompt
    if (stopped || paused) return;
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  async function flush() {
    if (stopped || paused || inFlight || !pending) return;
    inFlight = true;
    pending = false;
    onStatus("saving");
    try {
      await save();
      stopRetrying();
      onStatus("saved");
    } catch (error) {
      pending = true; // this edit was not saved
      if (error.kind === "conflict") {
        stopped = true;
        stopRetrying();
        onStatus("conflict");
      } else if (error.kind === "auth") {
        paused = true;
        stopRetrying();
        onStatus("auth");
      } else {
        onStatus(error.kind === "offline" ? "offline" : "error", error);
        retryTimer ??= setInterval(flush, retryMs);
      }
    } finally {
      inFlight = false;
      // Edits made while this save was in flight still need saving.
      if (pending && !stopped && !paused && !retryTimer) flush();
    }
  }

  // Call once a working token has been entered.
  function resume() {
    if (stopped || !paused) return;
    paused = false;
    flush();
  }

  window.addEventListener("beforeunload", (e) => {
    if (pending || inFlight) e.preventDefault();
  });

  // True when every edit is saved and saving still works.
  const isIdle = () => !pending && !inFlight && !stopped && !paused;

  return { changed, isIdle, resume };
}
