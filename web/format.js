// Small helpers shared by the To-Do and Wishlist tabs.

export function formatRand(n) {
  if (n === null || n === undefined) return "";
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "-" : ""}R ${grouped}.${cents}`;
}

export function parsePrice(s) {
  let t = String(s ?? "").replace(/[Rr\s]/g, "");
  // "1299,50" (comma as decimal mark) vs "1,299.50" (comma as thousands separator)
  t = /^\d+,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function safeLink(s) {
  let t = String(s ?? "").trim();
  if (t === "") return null;
  // No scheme ("shop.co.za/x", or "host:8080" where the colon starts a port) -> assume https.
  if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t)) t = `https://${t}`;
  try {
    const url = new URL(t);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const pad = (n) => String(n).padStart(2, "0");

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowISO(d = new Date()) {
  return `${todayISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function newId() {
  return crypto.randomUUID();
}
