# Wishlist Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude posts 2–3 buy options per wishlist item into the journal, weekly and on request; the owner accepts or dismisses them.

**Architecture:** `suggestions.py` owns `data/suggestions.json`, validating every write against the spec's rules and the live wishlist. `server.py` exposes it at `/api/suggestions`. `web/suggest.js` holds the Accept logic and the suggestions UI used by `wishlist.js`. A project skill describes the update procedure; a Claude desktop scheduled task runs it every Monday.

**Tech Stack:** Python 3.13 stdlib, plain ES modules (existing stack, nothing new).

**Spec:** `docs/superpowers/specs/2026-11-05-wishlist-suggestions-design.md`

## Global Constraints

- No new dependencies. Same server rules: `127.0.0.1:8765`, Host check, JSON responses with `Cache-Control: no-store`.
- Suggestions never modify `journal.json` or its `version`.
- 0–3 options per item. `name`, `shop`: non-empty strings. `price`: finite number ≥ 0 or `null`. `link`: starts with `https://` or `http://`. `note`: string. Item-level `note`: string.
- `checked` is set by the server: local time `YYYY-MM-DDTHH:MM:SS`.
- Damaged file → `suggestions.broken-YYYY-MM-DD-HHMMSS.json`, treated as empty.
- UI copy: badge `3 options` / `1 option` / `note`; header `Suggestions checked <ddd d MMM>` (e.g. `Mon 9 Nov`); card footer `Checked <ddd d MMM>`; buttons `Accept`, `Dismiss all`; Accept prepends `Was: <old name>` to notes.
- Schedule: every Monday 08:00, working folder `C:\Dev\journal`, prompt `Use the update-wishlist skill. This is a scheduled run.`

## Review Focus

1. **Odd item ids in the URL** — `/api/suggestions/..%2fjournal.json`, an empty id, or an id with `/` must return 404, never touch other files. Test in Task 2.
2. **Non-finite or negative prices** — JSON `NaN`, `Infinity`, `-5` must be rejected with 400 (Python's `json` accepts `NaN`). Test in Task 1.
3. **Extra keys in an option** — unknown keys are dropped, not stored. Test in Task 1.
4. **Unsafe links** — `javascript:alert(1)` rejected by the server (400); the UI also renders links only through `safeLink`. Test in Task 1.
5. **Server down on Accept/Dismiss** — Accept still updates the item (autosave shows the offline bar), the DELETE failure does not throw, and the suggestion reappears until it can be cleared. Manual check in Task 4.

---

### Task 1: Suggestion store (`suggestions.py`)

**Files:**
- Create: `suggestions.py`
- Test: `tests/test_suggestions.py`

**Interfaces:**
- Consumes: `JournalStore.load() -> dict` from `store.py` (wishlist items have `id`, `bought`).
- Produces:
  - `class NoSuchItem(Exception)`
  - `class SuggestionStore(data_dir: Path, journal: JournalStore, now: Callable[[], datetime] = datetime.now)`
  - `.load() -> dict` — `{"items": {...}}`; missing file → `{"items": {}}`; damaged file (invalid JSON or not `{"items": dict}`) → renamed per Global Constraints, returns empty.
  - `.put(item_id: str, body: dict) -> str` — validates `body` (`{"options": list, "note": str}`, `note` optional, default `""`) per Global Constraints, raising `ValueError`; raises `NoSuchItem` unless `item_id` is an unbought wishlist item; stores `{"checked", "note", "options"}` with each option reduced to the five known keys; drops entries whose item is gone or bought; returns `checked`.
  - `.delete(item_id: str) -> None` — idempotent.
  - All three hold one `threading.Lock`; writes go via `suggestions.json.tmp` + `os.replace`.

- [ ] **Step 1: Write the failing tests** (`unittest`, temp dir, fixed `now` = 2026-11-09 08:04:12; set up a `JournalStore` in the same dir and save a wishlist with items `a` (unbought), `b` (unbought), `c` (bought)). `OPT = {"name": "Logitech G413 SE", "price": 899.0, "shop": "Takealot", "link": "https://www.takealot.com/x", "note": "Cheapest in stock"}`.
  - `test_load_missing_is_empty`: `load() == {"items": {}}`.
  - `test_put_then_load`: `put("a", {"options": [OPT]}) == "2026-11-09T08:04:12"`; `load()["items"]["a"] == {"checked": "2026-11-09T08:04:12", "note": "", "options": [OPT]}`.
  - `test_zero_options_with_note`: `put("a", {"options": [], "note": "Too vague"})` stores `note == "Too vague"`, `options == []`.
  - `test_four_options_rejected`: 4×OPT → `ValueError`; `load()["items"] == {}`.
  - `test_bad_fields_rejected`: each of `name: ""`, `shop: ""`, `price: "899"`, `price: -5`, `price: float("nan")`, `price: float("inf")`, `link: "javascript:alert(1)"`, `link: "takealot.com"`, `note: 5`, body `{"options": "x"}` → `ValueError`.
  - `test_null_price_allowed`: `price: None` stores `None`.
  - `test_extra_keys_dropped`: option with `"evil": 1` stores without `evil`.
  - `test_unknown_or_bought_item_rejected`: `put("zzz", …)` and `put("c", …)` raise `NoSuchItem`.
  - `test_stale_entries_removed_on_put`: put `a` and `b`; then save journal with `b` removed; `put("a", …)` → `load()["items"]` has only `a`.
  - `test_delete_is_idempotent`: put `a`; `delete("a")`; `delete("a")`; `load()["items"] == {}`.
  - `test_damaged_file_set_aside`: write `{bad` to `suggestions.json`; `load() == {"items": {}}`; `suggestions.broken-2026-11-09-080412.json` exists with `{bad`.
  - `test_no_tmp_left_after_put`: no `*.tmp` in the dir after a put.

- [ ] **Step 2: Run, expect failure**
  Run: `python -m unittest tests.test_suggestions -v`
  Expected: `ModuleNotFoundError: No module named 'suggestions'`.

- [ ] **Step 3: Implement `suggestions.py`** to the interface. Use `math.isfinite` and `type(x) in (int, float)` (rejecting `bool`) for price; serialise with `ensure_ascii=False, indent=2`.

- [ ] **Step 4: Run, expect pass**
  Run: `python -m unittest discover -s tests -v`
  Expected: 32 tests `OK` (20 existing + 12 new).

- [ ] **Step 5: Commit**
  ```bash
  git add suggestions.py tests/test_suggestions.py
  git commit -m "Add suggestion store for wishlist buy options"
  ```

---

### Task 2: Suggestions API

**Files:**
- Modify: `server.py`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes: `SuggestionStore`, `NoSuchItem` (Task 1).
- Produces:
  - `GET /api/suggestions` → 200 `SuggestionStore.load()`.
  - `PUT /api/suggestions/<itemId>` → 200 `{"checked": "<time>"}`; 404 `{"error": "no such item"}`; 400 `{"error": "bad request"}`.
  - `DELETE /api/suggestions/<itemId>` → 200 `{}`.
  - `<itemId>` must match `^[A-Za-z0-9-]{1,64}$` after the `/api/suggestions/` prefix, else 404 `{"error": "no such item"}`. Any other `DELETE` path → 404.
  - `make_server(data_dir, web_dir, port)` keeps its signature and builds both stores.

- [ ] **Step 1: Write the failing tests** in `tests/test_server.py` (reuse `self.request`; PUT the journal first with wishlist item `{"id": "a", "name": "RAM", "price": null, "link": "", "notes": "", "bought": false}`):
  - `test_get_suggestions_empty`: 200, `{"items": {}}`.
  - `test_put_suggestions_then_get`: PUT `/api/suggestions/a` with one valid option → 200 with `checked`; GET shows it.
  - `test_put_suggestions_unknown_item_404`: `/api/suggestions/zzz` → 404 `{"error": "no such item"}`.
  - `test_put_suggestions_bad_body_400`: 4 options → 400; non-JSON → 400.
  - `test_put_suggestions_odd_ids_404`: `/api/suggestions/`, `/api/suggestions/..%2fjournal.json`, `/api/suggestions/a/b` → 404; `data/journal.json` unchanged.
  - `test_delete_suggestions`: after a PUT, DELETE → 200 `{}`; GET shows `{"items": {}}`; DELETE again → 200.
  - `test_suggestions_do_not_change_journal_version`: version before and after a suggestions PUT is equal.

- [ ] **Step 2: Run, expect failure**
  Run: `python -m unittest tests.test_server -v`
  Expected: the 7 new tests fail (404/501 responses).

- [ ] **Step 3: Implement** the routes in `JournalHandler` (`do_GET`, `do_PUT`, new `do_DELETE`), passing a `SuggestionStore` built in `make_server` alongside the `JournalStore`.

- [ ] **Step 4: Run all tests, expect pass**
  Run: `python -m unittest discover -s tests -v`
  Expected: 39 tests `OK`.

- [ ] **Step 5: Commit**
  ```bash
  git add server.py tests/test_server.py
  git commit -m "Add suggestions API to the journal server"
  ```

---

### Task 3: Suggestion helpers (`web/suggest.js`)

**Files:**
- Create: `web/suggest.js`, `web/test/suggest-test.html`

**Interfaces:**
- Consumes: `formatRand`, `safeLink` (`web/format.js`), `el` (`web/dom.js`).
- Produces:
  - `acceptOption(item, option) -> void` — per spec §5 Accept.
  - `latestChecked(items: object) -> string|null` — newest `checked` across entries.
  - `formatCheckedDate(iso: string) -> string` — `"2026-11-09T08:04:12"` → `"Mon 9 Nov"` (English day/month abbreviations, no leading zero).
  - `loadSuggestions() -> Promise<object>` — GET `/api/suggestions`, returns `.items`; on any failure returns `{}`.
  - `dismissSuggestions(itemId: string) -> Promise<boolean>` — DELETE; `true` on 200, `false` on failure (never throws).
  - `renderSuggestions(entry, { onAccept: (option) => void, onDismiss: () => void }) -> HTMLElement` — the editor's Suggestions section per spec §5 (item note, one card per option with `Accept`, footer `Checked <date>` + `Dismiss all`).

- [ ] **Step 1: Write the failing browser test** `web/test/suggest-test.html` (same pattern as `format-test.html`, prints `All N passed`):
  - accept on `{name: "RAM", price: null, link: "", notes: "", bought: false}` with `{name: "Kingston 16GB DDR4", price: 649, link: "https://x.co/r", shop: "Evetech", note: ""}` → name `Kingston 16GB DDR4`, price `649`, link `https://x.co/r`, notes `Was: RAM`, bought `false`.
  - accept when notes is `"for the work PC"` → notes `"Was: RAM\nfor the work PC"`.
  - accept when names are equal → notes unchanged.
  - `latestChecked({a: {checked: "2026-11-03T08:00:00"}, b: {checked: "2026-11-09T08:04:12"}}) === "2026-11-09T08:04:12"`; `latestChecked({}) === null`.
  - `formatCheckedDate("2026-11-09T08:04:12") === "Mon 9 Nov"`; `formatCheckedDate("2026-11-03T08:00:00") === "Tue 3 Nov"`.

- [ ] **Step 2: Run, expect failure** — open `http://localhost:8765/test/suggest-test.html`. Expected: stays at `Running…` (module missing).

- [ ] **Step 3: Implement `web/suggest.js`.**

- [ ] **Step 4: Run, expect pass** — reload. Expected: `All 7 passed`.

- [ ] **Step 5: Commit**
  ```bash
  git add web/suggest.js web/test/suggest-test.html
  git commit -m "Add suggestion helpers and Accept logic"
  ```

---

### Task 4: Suggestions in the Wishlist tab

**Files:**
- Modify: `web/app.js`, `web/wishlist.js`, `web/style.css`

**Interfaces:**
- Consumes: Task 3 exports.
- Produces: `state.suggestions` (object keyed by item id) — loaded in `start()` with `loadSuggestions()`, never sent by the saver. `refreshIfStale()` also reloads suggestions and re-renders when they differ (compare `JSON.stringify`), only while `saver.isIdle()`.

- [ ] **Step 1: Implement** per spec §5:
  - `wishlist.js` rows: badge after the name for unbought items with an entry (`N options` / `1 option` / `note`).
  - Header: `Suggestions checked <date>` from `latestChecked`, hidden when `null`.
  - Editor: append `renderSuggestions(entry, …)` when the item has an entry and is unbought. `onAccept`: `acceptOption`, `edit()`, `dismissSuggestions(id)`, delete `state.suggestions[id]`, re-render. `onDismiss`: `dismissSuggestions(id)`, on `true` delete the entry and re-render.
  - Styles: badge (small pill, accent-soft), option cards in a responsive grid.

- [ ] **Step 2: Manual check** — PUT suggestions for two real items with `curl` (one with 3 options, one with 0 options + note):
  - badges read `3 options` and `note`; header shows today's date in `ddd d MMM`.
  - open item → cards show name, `R …`, shop link, note, `Checked …`.
  - Accept → item takes the option's name/price/link, notes start with `Was: …`, `Saved` appears, badge gone, still gone after reload.
  - Dismiss all on the other → badge gone after reload; wishlist entry unchanged.
  - Mark an item with suggestions as Bought → no badge, no section.
  - Stop the server, click Accept → item updated with the offline bar, no console error; restart → saves; suggestion reappears until dismissed (Review Focus 5).
  - PUT suggestions while the page is open, switch away and back → badge appears.

- [ ] **Step 3: Commit**
  ```bash
  git add web/app.js web/wishlist.js web/style.css
  git commit -m "Show Claude's buy suggestions in the Wishlist tab"
  ```

---

### Task 5: Update procedure skill and first real run

**Files:**
- Create: `.claude/skills/update-wishlist/SKILL.md`

**Interfaces:**
- Consumes: `GET /api/data`, `GET /api/suggestions`, `PUT /api/suggestions/<id>` (Task 2).

- [ ] **Step 1: Write the skill** with frontmatter `name: update-wishlist` and a description that triggers on "update my wishlist", "find prices for my wishlist", "check deals for my wishlist". Body: spec §6 steps 1–5 and its hard rules, with the exact `curl` commands (`curl -s http://127.0.0.1:8765/api/data`; `curl -s -X PUT -H "Content-Type: application/json" --data @<file> http://127.0.0.1:8765/api/suggestions/<id>` using a temp file in the scratchpad so quoting is safe) and the option JSON shape from spec §3.

- [ ] **Step 2: First real run** — in this session, follow the skill on the owner's live wishlist (owner-requested run: check all unbought items). Expected: every unbought item gets a PUT that returns 200; summary lists each item's best price or why none.

- [ ] **Step 3: Owner review** — show the owner the results in the journal; adjust the skill's wording if they want different choices. Stop here until they are happy.

- [ ] **Step 4: Commit**
  ```bash
  git add .claude/skills/update-wishlist/SKILL.md
  git commit -m "Add update-wishlist skill"
  ```

---

### Task 6: Weekly schedule

**Files:** none (Claude desktop scheduled task)

- [ ] **Step 1: Create the scheduled task** with the scheduled-tasks tool: name `Update wishlist`, weekly Monday 08:00, folder `C:\Dev\journal`, prompt from Global Constraints.

- [ ] **Step 2: Verify** — list scheduled tasks and confirm the entry and next run time (next Monday 08:00). Tell the owner how to press **Run now** and that the first run needs their one-time permission approvals.

- [ ] **Step 3: Update README** — add a "Price suggestions" paragraph to the README body (not the Status block) explaining weekly runs, "update my wishlist", and Accept/Dismiss; commit with `git commit -m "Document wishlist price suggestions"`.
