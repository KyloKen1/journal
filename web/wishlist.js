import { el } from "./dom.js";
import { formatRand, newId, parsePrice, safeLink } from "./format.js";
import {
  acceptOption, dismissSuggestions, formatCheckedDate, latestChecked, renderSuggestions,
} from "./suggest.js";

// View settings survive switching tabs, but not a page reload.
let showBought = false;
let openId = null;

export function renderWishlist(root, state, changed) {
  const listEl = el("ol", { class: "wish-items" });
  const totalEl = el("span", { class: "total" });
  const checkedEl = el("span", { class: "checked muted" });
  let dragId = null;

  // Suggestions only matter for items still to buy.
  const suggestionsFor = (item) => (item.bought ? null : state.suggestions[item.id] ?? null);

  root.append(
    el("div", { class: "wishlist" },
      el("div", { class: "wish-header" },
        el("button", { type: "button", class: "primary", onclick: addItem }, "+ Add item"),
        checkedEl,
        totalEl,
        el("label", { class: "toggle" },
          el("input", {
            type: "checkbox", checked: showBought,
            onchange: (e) => { showBought = e.target.checked; renderList(); },
          }),
          "Show bought",
        ),
      ),
      el("p", { class: "muted hint" }, "Drag ⠿ to rank. The top item matters most."),
      listEl,
    ),
  );

  function edit() {
    changed();
    renderTotal();
  }

  function renderTotal() {
    const sum = state.wishlist
      .filter((i) => !i.bought && i.price !== null)
      .reduce((total, i) => total + i.price, 0);
    totalEl.textContent = `Total: ${formatRand(sum)}`;
  }

  function addItem() {
    const item = { id: newId(), name: "New item", price: null, link: "", notes: "", bought: false };
    state.wishlist.push(item);
    openId = item.id;
    edit();
    renderList();
    const name = listEl.querySelector(".wish-editor .name-input");
    name.focus();
    name.select();
  }

  function move(fromId, toId) {
    const from = state.wishlist.findIndex((i) => i.id === fromId);
    const to = state.wishlist.findIndex((i) => i.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = state.wishlist.splice(from, 1);
    state.wishlist.splice(to, 0, item);
    edit();
    renderList();
  }

  function renderList() {
    const visible = state.wishlist.filter((i) => showBought || !i.bought);
    listEl.replaceChildren(...visible.map((item, n) => renderRow(item, n + 1)));
    if (visible.length === 0) {
      listEl.append(el("li", { class: "muted empty" }, state.wishlist.length ? "Everything here is bought." : "Nothing on the wishlist yet."));
    }
    renderTotal();
    const checked = latestChecked(state.suggestions);
    checkedEl.textContent = checked ? `Suggestions checked ${formatCheckedDate(checked)}` : "";
  }

  function badge(item) {
    const entry = suggestionsFor(item);
    if (!entry) return null;
    const n = entry.options.length;
    const text = n === 0 ? "note" : n === 1 ? "1 option" : `${n} options`;
    return el("span", { class: "badge", title: "Claude's suggestions — open the item to see them" }, text);
  }

  function acceptSuggestion(item, option) {
    acceptOption(item, option);
    edit();
    delete state.suggestions[item.id];
    dismissSuggestions(item.id); // if this fails, the suggestion reappears until dismissed
    renderList();
  }

  async function dismissAll(item) {
    if (await dismissSuggestions(item.id)) {
      delete state.suggestions[item.id];
      renderList();
    }
  }

  function renderRow(item, rank) {
    const nameEl = el("span", { class: "wish-name" });
    const priceEl = el("span", { class: "wish-price" });
    const linkEl = el("span", { class: "wish-link" });
    const notesEl = el("span", { class: "wish-notes muted" });

    function refresh() {
      nameEl.textContent = item.name || "Untitled";
      priceEl.textContent = formatRand(item.price);
      notesEl.textContent = item.notes.split("\n")[0];
      const href = safeLink(item.link);
      linkEl.replaceChildren(
        href ? el("a", { href, target: "_blank", rel: "noopener", title: href, "aria-label": "Open shop page" }, "↗") : "",
      );
    }
    refresh();

    const open = item.id === openId;
    const li = el("li", {
      class: ["wish", item.bought && "bought", open && "open"].filter(Boolean).join(" "),
      ondragover: (e) => { if (dragId) { e.preventDefault(); li.classList.add("drop-target"); } },
      ondragleave: () => li.classList.remove("drop-target"),
      ondrop: (e) => { e.preventDefault(); li.classList.remove("drop-target"); move(dragId, item.id); },
    },
      el("div", {
        class: "wish-row",
        onclick: (e) => {
          if (e.target.closest("a, input, .handle")) return;
          openId = open ? null : item.id;
          renderList();
        },
      },
        el("span", {
          class: "handle", draggable: "true", title: "Drag to rank", "aria-hidden": "true",
          ondragstart: (e) => {
            dragId = item.id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", item.id);
            e.dataTransfer.setDragImage(li, 20, 20);
            li.classList.add("dragging");
          },
          ondragend: () => { dragId = null; li.classList.remove("dragging"); },
        }, "⠿"),
        el("span", { class: "rank muted" }, `${rank}.`),
        el("span", { class: "wish-name-cell" }, nameEl, badge(item)),
        notesEl,
        priceEl,
        linkEl,
        el("label", { class: "toggle bought-toggle" },
          el("input", {
            type: "checkbox", checked: item.bought,
            onchange: (e) => { item.bought = e.target.checked; edit(); renderList(); },
          }),
          "Bought",
        ),
      ),
      open && renderEditor(item, refresh),
    );
    return li;
  }

  function renderEditor(item, refresh) {
    const field = (label, input) => el("label", { class: "field" }, el("span", {}, label), input);
    const text = (key, cls) => el("input", {
      type: "text", class: cls, value: item[key],
      oninput: (e) => { item[key] = e.target.value; refresh(); edit(); },
    });

    return el("div", { class: "wish-editor" },
      field("Name", text("name", "name-input")),
      field("Price (R)", el("input", {
        type: "text", inputmode: "decimal", value: item.price ?? "", placeholder: "e.g. 1 299",
        oninput: (e) => { item.price = parsePrice(e.target.value); refresh(); edit(); },
        onchange: (e) => { e.target.value = item.price ?? ""; },
      })),
      field("Link", text("link")),
      field("Notes", el("textarea", {
        rows: 3, value: item.notes,
        oninput: (e) => { item.notes = e.target.value; refresh(); edit(); },
      })),
      suggestionsFor(item) && renderSuggestions(suggestionsFor(item), {
        onAccept: (option) => acceptSuggestion(item, option),
        onDismiss: () => dismissAll(item),
      }),
      el("div", { class: "actions" },
        el("button", { type: "button", onclick: () => { openId = null; renderList(); } }, "Done"),
        el("button", {
          type: "button", class: "danger",
          onclick: () => {
            if (!confirm("Delete this item?")) return;
            state.wishlist.splice(state.wishlist.indexOf(item), 1);
            openId = null;
            edit();
            renderList();
          },
        }, "Delete"),
      ),
    );
  }

  renderList();
}
