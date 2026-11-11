// Saving journal.json with a second look before calling a refusal a real conflict.
// GitHub refuses a save (409) when the file changed since the sha it was based on, but the
// same answer also comes back in two harmless cases:
//  - our previous attempt did land and only its answer was lost (signal dropped), so the
//    retry is now based on an old sha;
//  - GitHub was busy with another write to the repo and nothing actually changed.
// Stopping the page for those would throw away the owner's latest edits for nothing.

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
