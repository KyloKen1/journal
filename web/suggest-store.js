// Claude's suggestions file in the data repo. The page only ever removes things from it
// (accept, dismiss), while Claude's scheduled check may rewrite it at any time, so every
// change is a function that can be re-applied to a freshly loaded copy.
import { normalizeSuggestions } from "./todo-model.js";

export function createSuggestionStore({ storage, path }) {
  let current = { items: {}, todos: {} };
  let sha = null;
  let queue = Promise.resolve(); // one update at a time, so two quick clicks don't collide

  async function load() {
    const file = await storage.load(path);
    current = normalizeSuggestions(file.data);
    sha = file.sha;
    return structuredClone(current);
  }

  async function attempt(mutate) {
    for (let tries = 0; tries < 2; tries++) {
      const next = structuredClone(current);
      mutate(next);
      try {
        sha = await storage.save(path, next, sha);
        current = next;
        return true;
      } catch (error) {
        if (error.kind !== "conflict" || tries === 1) return false;
        try {
          await load(); // the file changed elsewhere: redo the change on the fresh copy
        } catch {
          return false;
        }
      }
    }
    return false;
  }

  // mutate(data) must be safe to run twice. Resolves true once the change is saved.
  function update(mutate) {
    queue = queue.then(() => attempt(mutate));
    return queue;
  }

  return { load, update };
}
