// Reads and writes JSON files in the data repo through GitHub's Contents API.
// A file's sha is its version: a save must quote the sha it was based on, and GitHub
// refuses it if the file has changed since.

const API = "https://api.github.com";

// kind: "auth" (token missing, rejected, or can't see the repo), "conflict" (file changed
// since it was loaded), "offline" (no answer), "invalid" (file isn't readable JSON),
// "missing" (the token works but the file isn't in the repo),
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

// Browsers refuse a keepalive request with a body over 64 KB.
const KEEPALIVE_LIMIT = 60_000;

// A 403 can mean "slow down" rather than "bad token".
const rateLimited = (res) =>
  res.status === 403 && (res.headers.has("retry-after") || res.headers.get("x-ratelimit-remaining") === "0");

export function createStorage({ repo, getToken, fetch = globalThis.fetch }) {
  // GitHub wants writes to a repo one at a time; parallel ones can be refused with 409.
  let writes = Promise.resolve();

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json" });

  async function canSeeRepo() {
    try {
      return (await fetch(`${API}/repos/${repo}`, { cache: "no-store", headers: headers() })).ok;
    } catch {
      throw new StorageError("offline");
    }
  }

  async function request(path, init = {}) {
    let res;
    try {
      res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
        ...init,
        cache: "no-store",
        headers: headers(),
      });
    } catch {
      throw new StorageError("offline");
    }
    if (rateLimited(res)) throw new StorageError("http", res.status);
    // 404 is what GitHub answers both when the token can't see the private repo and when
    // the file isn't there. Asking for the repo itself tells the two apart.
    if (res.status === 404 && (await canSeeRepo())) throw new StorageError("missing", 404);
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

  function save(path, data, sha) {
    // No sha means the file does not exist yet: leaving it out makes GitHub create the file.
    const body = JSON.stringify({ message: `Update ${path}`, content: encode(JSON.stringify(data, null, 2)), ...(sha ? { sha } : {}) });
    const send = async () => {
      // keepalive lets a save that starts as the page is hidden or closed still finish.
      const result = await request(path, { method: "PUT", body, keepalive: body.length < KEEPALIVE_LIMIT });
      if (typeof result?.content?.sha !== "string") throw new StorageError("invalid");
      return result.content.sha;
    };
    const result = writes.then(send);
    writes = result.catch(() => {}); // a failed save must not block the next one
    return result;
  }

  return { load, save };
}
