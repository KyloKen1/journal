// Saving journal.json with a second look before calling a refusal a real conflict.
// GitHub refuses a save (409) when the file changed since the sha it was based on, but the
// same answer also comes back in two harmless cases:
//  - our previous attempt did land and only its answer was lost (signal dropped), so the
//    retry is now based on an old sha;
//  - GitHub was busy with another write to the repo and nothing actually changed.
// Stopping the page for those would throw away the owner's latest edits for nothing.

// Several files behind one autosaver: remembers which have unsaved edits and saves only those.
// files is { name: { path, data(), getSha(), setSha(sha) } }.
export function createDirtySave(storage, files) {
  const dirty = new Set();
  return {
    mark: (name) => dirty.add(name),
    async save() {
      for (const name of [...dirty]) {
        const file = files[name];
        dirty.delete(name); // an edit made while this save is in flight marks it again
        try {
          file.setSha(await saveChecked(storage, file.path, file.data(), file.getSha()));
        } catch (error) {
          dirty.add(name);
          throw error;
        }
      }
    },
  };
}

export async function saveChecked(storage, path, data, sha) {
  try {
    return await storage.save(path, data, sha);
  } catch (error) {
    if (error.kind !== "conflict") throw error;
    const file = await storage.load(path); // can't reach GitHub: that error is retried later
    if (JSON.stringify(file.data) === JSON.stringify(data)) return file.sha; // our save is already there
    if (file.sha !== sha) throw error; // really changed elsewhere: never overwrite it
    return await storage.save(path, data, sha); // unchanged: try once more
  }
}
