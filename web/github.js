// Reads and writes JSON files in the data repo through GitHub's Contents API.
// A file's sha is its version: a save must quote the sha it was based on, and GitHub
// refuses it if the file has changed since.

const API = "https://api.github.com";

// kind: "auth" (token missing, rejected, or can't see the repo), "conflict" (file changed
// since it was loaded), "offline" (no answer), "invalid" (file isn't readable JSON),
// "http" (any other GitHub error; status holds the code).
export class StorageError extends Error {
  constructor(kind, status = null) {
    super(`storage error: ${kind}${status ? ` (${status})` : ""}`);
    this.kind = kind;
    this.status = status;
  }
}

function encode(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function createStorage({ repo, getToken, fetch = globalThis.fetch }) {
  async function request(path, init = {}) {
    let res;
    try {
      res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
        ...init,
        cache: "no-store",
        headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json" },
      });
    } catch {
      throw new StorageError("offline");
    }
    // 404 is what GitHub answers when the token can't see a private repo.
    if ([401, 403, 404].includes(res.status)) throw new StorageError("auth", res.status);
    if ([409, 422].includes(res.status)) throw new StorageError("conflict", res.status);
    if (!res.ok) throw new StorageError("http", res.status);
    try {
      return await res.json();
    } catch {
      throw new StorageError("invalid");
    }
  }

  async function load(path) {
    const file = await request(path);
    // Files over 1 MB come back with no inline content.
    if (file.encoding !== "base64" || !file.content) throw new StorageError("invalid");
    try {
      return { data: JSON.parse(decode(file.content)), sha: file.sha };
    } catch {
      throw new StorageError("invalid");
    }
  }

  async function save(path, data, sha) {
    const body = { message: `Update ${path}`, content: encode(JSON.stringify(data, null, 2)), sha };
    const result = await request(path, { method: "PUT", body: JSON.stringify(body) });
    return result.content.sha;
  }

  return { load, save };
}
