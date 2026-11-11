// The Books tab: books the owner is reading or has read, how far through each one they are,
// and what they liked and disliked. Private notes: nothing here is shown to or suggested by Claude.
import { clampPercent, isReading, newBook, sortedBooks } from "./books-model.js";
import { el } from "./dom.js";
import { todayISO } from "./format.js";
import { formatCheckedDate } from "./suggest.js";

// Which book is open survives switching tabs, but not a page reload.
let openId = null;

export function renderBooks(root, state, changed) {
  const listEl = el("ol", { class: "book-items" });
  const countEl = el("span", { class: "muted book-count" });

  root.append(
    el("div", { class: "books" },
      el("div", { class: "book-header" },
        el("button", { type: "button", class: "primary book-add", onclick: addBook }, "+ Add book"),
        countEl,
      ),
      listEl,
    ),
  );

  function addBook() {
    const book = newBook();
    state.books.push(book);
    openId = book.id;
    changed();
    renderList();
    listEl.querySelector(".book-editor .book-title-input").focus();
  }

  function renderCount() {
    const total = state.books.length;
    const reading = state.books.filter(isReading).length;
    countEl.textContent = reading === 0
      ? (total === 1 ? "1 book" : `${total} books`)
      : `${reading} reading · ${total - reading} finished`;
  }

  function renderList() {
    const books = sortedBooks(state.books);
    listEl.replaceChildren(...books.map(renderRow));
    if (books.length === 0) listEl.append(el("li", { class: "muted empty" }, "No books yet. Add one you're reading or have read."));
    renderCount();
  }

  function renderRow(book) {
    const titleEl = el("span", { class: "book-title" });
    const authorEl = el("span", { class: "book-author muted" });
    const barEl = el("progress", { class: "book-bar", max: 100 });
    const percentEl = el("span", { class: "book-percent muted" });
    const dateEl = el("span", { class: "book-date muted" });

    function refresh() {
      titleEl.textContent = book.title || "Untitled";
      authorEl.textContent = book.author;
      barEl.value = book.percent;
      barEl.setAttribute("aria-label", `${book.percent}% read`);
      percentEl.textContent = `${book.percent}%`;
      dateEl.textContent = book.finished ? `${formatCheckedDate(book.finished)} ${book.finished.slice(0, 4)}` : "";
      renderCount();
    }
    refresh();

    const open = book.id === openId;
    return el("li", { class: open ? "book open" : "book" },
      el("button", {
        type: "button", class: "book-row", "aria-expanded": String(open),
        onclick: () => { openId = open ? null : book.id; renderList(); },
      }, titleEl, authorEl, barEl, percentEl, dateEl),
      open && renderEditor(book, refresh),
    );
  }

  function renderEditor(book, refresh) {
    const field = (label, input, cls = "field") => el("label", { class: cls }, el("span", {}, label), input);
    const edit = (key) => (e) => { book[key] = e.target.value; refresh(); changed(); };

    const finishedEl = el("input", { type: "date", class: "book-finished-input", value: book.finished, oninput: edit("finished") });
    const sliderEl = el("input", {
      type: "range", class: "book-percent-slider", min: 0, max: 100, step: 1, value: book.percent,
      "aria-label": "Percent read", oninput: (e) => setPercent(e.target.value, sliderEl),
    });
    const numberEl = el("input", {
      type: "number", class: "book-percent-input", min: 0, max: 100, step: 1, inputMode: "numeric", value: book.percent,
      "aria-label": "Percent read", oninput: (e) => setPercent(e.target.value, numberEl),
      onchange: () => { numberEl.value = book.percent; }, // tidy "150" or a blank once typing stops
    });

    // The slider and the number box show the same value; the one being used is left alone.
    function setPercent(raw, source) {
      book.percent = clampPercent(raw);
      if (source !== sliderEl) sliderEl.value = book.percent;
      if (source !== numberEl) numberEl.value = book.percent;
      // Reaching the end finishes the book today, unless a date is already there.
      if (book.percent === 100 && !book.finished) {
        book.finished = todayISO();
        finishedEl.value = book.finished;
      }
      refresh();
      changed();
    }

    return el("div", { class: "book-editor" },
      field("Title", el("input", { type: "text", class: "book-title-input", value: book.title, oninput: edit("title") })),
      field("Author", el("input", { type: "text", class: "book-author-input", value: book.author, oninput: edit("author") })),
      field("Finished", finishedEl),
      el("div", { class: "field wide" },
        el("span", {}, "How far through"),
        el("div", { class: "book-percent-row" }, sliderEl, numberEl, el("span", {}, "%")),
      ),
      field("What I liked", el("textarea", { rows: 5, class: "book-liked", value: book.liked, oninput: edit("liked") }), "field wide"),
      field("What I disliked", el("textarea", { rows: 5, class: "book-disliked", value: book.disliked, oninput: edit("disliked") }), "field wide"),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "book-done", onclick: () => { openId = null; renderList(); } }, "Done"),
        el("button", {
          type: "button", class: "danger book-delete",
          onclick: () => {
            if (!confirm("Delete this book and its notes? This can't be undone.")) return;
            state.books.splice(state.books.indexOf(book), 1);
            openId = null;
            changed();
            renderList();
          },
        }, "Delete"),
      ),
    );
  }

  renderList();
}
