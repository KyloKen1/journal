// Books logic with no page or network code. A book is
// { id, title, author, percent: 0-100 read, finished: "YYYY-MM-DD" or "", liked, disliked }.
import { newId } from "./format.js";

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

// A whole number from 0 to 100, whatever was typed. Blank or nonsense counts as 0.
export function clampPercent(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

// Accepts the contents of books.json. Throws for a file we don't understand, so it is never
// shown as an empty list and saved over. A hand-edited book with missing fields is repaired.
// A book saved before percentages existed was a book already read: it counts as 100%.
export function normalizeBooks(data) {
  if (!isObject(data) || !Array.isArray(data.books)) throw new Error("books data is not readable");
  return data.books.filter(isObject).map((book) => ({
    id: text(book.id) || newId(),
    title: text(book.title),
    author: text(book.author),
    percent: typeof book.percent === "number" ? clampPercent(book.percent) : 100,
    finished: /^\d{4}-\d{2}-\d{2}$/.test(book.finished) ? book.finished : "",
    liked: text(book.liked),
    disliked: text(book.disliked),
  }));
}

// A new book is one just started: nothing read, no finished date yet.
export function newBook() {
  return { id: newId(), title: "", author: "", percent: 0, finished: "", liked: "", disliked: "" };
}

export const isReading = (book) => book.percent < 100;

// Books still being read come first, then finished ones, most recently finished first
// (no date last). Among equals, the one added last comes first.
export function sortedBooks(books) {
  return books
    .map((book, index) => ({ book, index }))
    .sort((a, b) =>
      isReading(b.book) - isReading(a.book) ||
      (isReading(a.book) ? 0 : b.book.finished.localeCompare(a.book.finished)) ||
      b.index - a.index)
    .map(({ book }) => book);
}
