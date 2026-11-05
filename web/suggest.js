// Claude's buy suggestions for wishlist items: loading, Accept/Dismiss, and the editor section.
import { el } from "./dom.js";
import { formatRand, safeLink } from "./format.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function acceptOption(item, option) {
  if (option.name !== item.name) {
    item.notes = item.notes ? `Was: ${item.name}\n${item.notes}` : `Was: ${item.name}`;
  }
  item.name = option.name;
  item.price = option.price;
  item.link = option.link;
}

export function latestChecked(items) {
  const times = Object.values(items).map((entry) => entry.checked);
  return times.length ? times.sort().at(-1) : null;
}

export function formatCheckedDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export async function loadSuggestions() {
  try {
    const res = await fetch("/api/suggestions");
    if (!res.ok) return {};
    return (await res.json()).items;
  } catch {
    return {};
  }
}

export async function dismissSuggestions(itemId) {
  try {
    const res = await fetch(`/api/suggestions/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

// Items whose suggestion was accepted. They are cleared on the server only once the journal has
// saved the accepted change, so a failed save never loses Claude's research for that item.
export function createDismissQueue(dismiss) {
  const ids = new Set();
  return {
    add: (id) => ids.add(id),
    has: (id) => ids.has(id),
    async flush() {
      for (const id of [...ids]) {
        if (await dismiss(id)) ids.delete(id);
      }
    },
  };
}

export const acceptedQueue = createDismissQueue(dismissSuggestions);

export function renderSuggestions(entry, { onAccept, onDismiss }) {
  return el("section", { class: "suggestions" },
    el("h3", {}, "Suggestions"),
    entry.note && el("p", { class: "muted" }, entry.note),
    el("div", { class: "option-cards" },
      entry.options.map((option) => {
        const href = safeLink(option.link);
        return el("div", { class: "option-card" },
          el("strong", {}, option.name),
          el("span", { class: "option-price" }, formatRand(option.price)),
          href
            ? el("a", { href, target: "_blank", rel: "noopener" }, `${option.shop} ↗`)
            : el("span", {}, option.shop),
          option.note && el("span", { class: "muted" }, option.note),
          el("button", { type: "button", class: "primary", onclick: () => onAccept(option) }, "Accept"),
        );
      }),
    ),
    el("div", { class: "suggestions-footer" },
      el("span", { class: "muted" }, `Checked ${formatCheckedDate(entry.checked)}`),
      el("button", { type: "button", onclick: onDismiss }, "Dismiss all"),
    ),
  );
}
