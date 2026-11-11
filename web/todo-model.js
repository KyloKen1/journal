// To-do logic with no page or network code: shapes, conversion from the old Work cards,
// carry-over days, and applying Claude's suggestions.
// Dates are "YYYY-MM-DD"; timestamps are "YYYY-MM-DDTHH:MM:SS" in local time.
import { newId } from "./format.js";

const KEEP_DISMISSED = 10;
const DAY_MS = 86_400_000;

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

// A Work card from the old journal becomes a to-do item.
export function convertIssue(issue) {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.details ?? "",
    upNext: issue.nextSteps ?? [],
    progress: issue.done ?? [],
    completed: Boolean(issue.archived),
    completedDate: issue.archived ? issue.updated.slice(0, 10) : null,
    created: issue.created,
    updated: issue.updated,
  };
}

// Accepts the current file shape or the old one (issues + version). Throws for anything
// else, so a file we don't understand is never shown as an empty list and saved over.
export function normalizeJournal(data) {
  if (!isObject(data) || !Array.isArray(data.wishlist)) throw new Error("journal data is not readable");
  if (Array.isArray(data.todos)) return { todos: data.todos, wishlist: data.wishlist };
  if (Array.isArray(data.issues)) return { todos: data.issues.map(convertIssue), wishlist: data.wishlist };
  throw new Error("journal data is not readable");
}

export function normalizeSuggestions(data) {
  const source = isObject(data) ? data : {};
  return {
    items: isObject(source.items) ? source.items : {},
    todos: isObject(source.todos) ? source.todos : {},
  };
}

export function newTodo(title, now) {
  return {
    id: newId(), title, description: "", upNext: [], progress: [],
    completed: false, completedDate: null, created: now, updated: now,
  };
}

function localDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Whole calendar days since the item was added. Rounded, so a daylight-saving day still counts as one.
export function carriedOverDays(todo, today) {
  return Math.max(0, Math.round((localDate(today) - localDate(todo.created)) / DAY_MS));
}

export function openTodos(todos) {
  return todos.filter((t) => !t.completed).sort((a, b) => a.created.localeCompare(b.created));
}

export function completedTodos(todos) {
  return todos.filter((t) => t.completed).sort((a, b) => (b.completedDate ?? "").localeCompare(a.completedDate ?? ""));
}

export function completeTodo(todo, today) {
  todo.completed = true;
  todo.completedDate = today;
}

export function reopenTodo(todo) {
  todo.completed = false;
  todo.completedDate = null;
}

export function completeStep(todo, step, today) {
  todo.upNext.splice(todo.upNext.indexOf(step), 1);
  todo.progress.unshift({ id: step.id, text: step.text, date: today });
}

const findSuggestion = (entry, id) => (Array.isArray(entry?.suggestions) ? entry.suggestions.find((s) => s.id === id) : undefined);

export function removeSuggestion(entry, suggestionId) {
  const suggestion = findSuggestion(entry, suggestionId);
  if (suggestion) entry.suggestions.splice(entry.suggestions.indexOf(suggestion), 1);
  return suggestion;
}

// Adds the suggestion's ready-made steps to Up next. False if the suggestion is gone.
export function applySuggestion(todo, entry, suggestionId) {
  const suggestion = removeSuggestion(entry, suggestionId);
  if (!suggestion) return false;
  for (const text of suggestion.steps ?? []) todo.upNext.push({ id: newId(), text });
  return true;
}

// Remembers the text so Claude does not suggest the same thing again.
export function dismissSuggestion(entry, suggestionId) {
  const suggestion = removeSuggestion(entry, suggestionId);
  if (!suggestion) return;
  entry.dismissed = [...(Array.isArray(entry.dismissed) ? entry.dismissed : []), suggestion.text].slice(-KEEP_DISMISSED);
}

export function pendingSuggestions(todo, todoSuggestions) {
  const entry = todoSuggestions?.[todo.id];
  return !todo.completed && Array.isArray(entry?.suggestions) ? entry.suggestions : [];
}
