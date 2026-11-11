// Books logic with no page or network code. A book is
// { id, title, author, finished: "YYYY-MM-DD" or "", liked, disliked }.
import { newId } from "./format.js";

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

// Accepts the contents of books.json. Throws for a file we don't understand, so it is never
// shown as an empty list and saved over. A hand-edited book with missing fields is repaired.
export function normalizeBooks(data) {
  if (!isObject(data) || !Array.isArray(data.books)) throw new Error("books data is not readable");
  return data.books.filter(isObject).map((book) => ({
    id: text(book.id) || newId(),
    title: text(book.title),
    author: text(book.author),
    finished: /^\d{4}-\d{2}-\d{2}$/.test(book.finished) ? book.finished : "",
    liked: text(book.liked),
    disliked: text(book.disliked),
  }));
}

export function newBook(today) {
  return { id: newId(), title: "", author: "", finished: today, liked: "", disliked: "" };
}

// Most recently finished first; books with no date last. Among equals, the one added last comes first.
export function sortedBooks(books) {
  return books
    .map((book, index) => ({ book, index }))
    .sort((a, b) => b.book.finished.localeCompare(a.book.finished) || b.index - a.index)
    .map(({ book }) => book);
}
