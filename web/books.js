// The Books tab: books the owner has read, with what they liked and disliked about each.
// Private notes: nothing here is shown to or suggested by Claude.
import { newBook, sortedBooks } from "./books-model.js";
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
    const book = newBook(todayISO());
    state.books.push(book);
    openId = book.id;
    changed();
    renderList();
    listEl.querySelector(".book-editor .book-title-input").focus();
  }

  function renderList() {
    const books = sortedBooks(state.books);
    listEl.replaceChildren(...books.map(renderRow));
    if (books.length === 0) listEl.append(el("li", { class: "muted empty" }, "No books yet. Add the first one you've read."));
    countEl.textContent = books.length === 1 ? "1 book" : `${books.length} books`;
  }

  function renderRow(book) {
    const titleEl = el("span", { class: "book-title" });
    const authorEl = el("span", { class: "book-author muted" });
    const dateEl = el("span", { class: "book-date muted" });

    function refresh() {
      titleEl.textContent = book.title || "Untitled";
      authorEl.textContent = book.author;
      dateEl.textContent = book.finished ? `${formatCheckedDate(book.finished)} ${book.finished.slice(0, 4)}` : "";
    }
    refresh();

    const open = book.id === openId;
    return el("li", { class: open ? "book open" : "book" },
      el("button", {
        type: "button", class: "book-row", "aria-expanded": String(open),
        onclick: () => { openId = open ? null : book.id; renderList(); },
      }, titleEl, authorEl, dateEl),
      open && renderEditor(book, refresh),
    );
  }

  function renderEditor(book, refresh) {
    const field = (label, input, cls = "field") => el("label", { class: cls }, el("span", {}, label), input);
    const edit = (key) => (e) => { book[key] = e.target.value; refresh(); changed(); };

    return el("div", { class: "book-editor" },
      field("Title", el("input", { type: "text", class: "book-title-input", value: book.title, oninput: edit("title") })),
      field("Author", el("input", { type: "text", class: "book-author-input", value: book.author, oninput: edit("author") })),
      field("Finished", el("input", { type: "date", class: "book-finished-input", value: book.finished, oninput: edit("finished") })),
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
