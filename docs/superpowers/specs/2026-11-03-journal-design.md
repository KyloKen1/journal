# Journal — Design

Date: 2026-11-03
Status: Draft, awaiting owner review

## 1. Purpose

A personal journal app for one person on one Windows PC. It does two jobs:

1. **Work tracking** — one card per issue the owner is working on, holding the issue details, what has been done, and the next steps. The owner writes and edits everything by hand.
2. **Wishlist** — things the owner wants to buy, ranked by priority.

**Success looks like:** the owner double-clicks one file, the journal opens in the browser, and every change is saved to a file on disk without any further action.

### Constraints (stated by the owner)
- Only used on this PC. No phone, no other devices.
- Single user. No logins.
- The owner edits all content manually; the app does not generate content.

### Assumptions
- No internet connection is needed. Nothing leaves the PC.
- Prices are in South African rand, written as `R 1 299.00`.
- Python 3.13 is installed (it is). Node is not, and is not needed.

## 2. Architecture

A local web app: a browser page backed by a small Python helper that uses only the standard library.

```
C:\Dev\journal\
  Journal.bat              start helper + open browser
  server.py                HTTP server (stdlib only), serves web/ and the data API
  web\index.html           page shell
  web\app.js               all UI logic (plain JavaScript, no framework, no build step)
  web\style.css
  data\journal.json        all data (git-ignored)
  data\backups\            daily backups (git-ignored)
  tests\test_server.py     unittest tests for server.py
```

### server.py
- Listens on `127.0.0.1:8765` only (not reachable from other machines).
- `GET /` and static files from `web/`.
- `GET /api/data` → returns the contents of `journal.json` plus its `version`.
- `PUT /api/data` → body is the full data object including the `version` it was based on. Saves it and returns the new `version`.
- No other endpoints. The whole file is read and written each time; the data is small.

### Journal.bat
- If something already answers on port 8765, just open the browser to `http://localhost:8765`.
- Otherwise start `python server.py` in a minimised window, then open the browser.

## 3. Data

`data/journal.json`:

```json
{
  "version": 12,
  "issues": [
    {
      "id": "uuid",
      "title": "Fix unit formation drift",
      "details": "free text",
      "nextSteps": [{ "id": "uuid", "text": "Check spacing maths" }],
      "done": [{ "id": "uuid", "text": "Reproduced the bug", "date": "2026-11-03" }],
      "archived": false,
      "created": "2026-11-03T10:00:00",
      "updated": "2026-11-03T12:30:00"
    }
  ],
  "wishlist": [
    {
      "id": "uuid",
      "name": "Mechanical keyboard",
      "price": 1299.00,
      "link": "https://...",
      "notes": "brown switches",
      "bought": false
    }
  ]
}
```

- **Wishlist rank** is the item's position in the `wishlist` array. Index 0 is the highest priority.
- `price` is a number in rand, or `null` if unknown.
- `version` is an integer the server increments on each successful save.

## 4. Screens

Two tabs at the top: **Work** and **Wishlist**. A small status line shows "Saved" / "Saving…" / errors.

### Work tab
- **Left column:** "+ New issue" button, search box (filters by title), "Show archived" toggle, then the list of cards sorted by `updated`, newest first. Archived cards are hidden unless the toggle is on, and shown greyed when visible.
- **Right panel (selected card):**
  - Title (editable inline).
  - Details: large multi-line text box.
  - **Next steps:** checklist with an "add step" input. Each step can be edited or deleted. Ticking a step removes it from Next steps and adds it to Done with today's date.
  - **Done:** list of items with dates, newest first. An "add done item" input adds an item dated today. Items can be edited or deleted.
  - Buttons: **Archive** / **Unarchive**, **Delete** (asks for confirmation).
- Any edit to a card updates its `updated` time.

### Wishlist tab
- Header: "+ Add item" button, total of all unbought prices (e.g. `Total: R 4 597.00`), "Show bought" toggle.
- Ranked list. Each row: drag handle ⠿, name, price, link icon (opens in a new tab, shown only if a link is set), first line of notes, Bought checkbox.
- Drag a row by its handle to change rank (HTML5 drag and drop).
- Clicking a row expands it inline to edit name, price, link and notes, with a Delete button (asks for confirmation).
- New items are added at the bottom.
- Bought items are hidden unless "Show bought" is on; when shown, they appear greyed in their ranked position.

## 5. Saving

- Every change triggers an autosave about 1 second after the last edit (debounced). No Save button.
- The page sends the full data object with the `version` it last loaded or saved.
- The server writes to `journal.json.tmp` and then replaces `journal.json` with it (`os.replace`), so a crash mid-write cannot corrupt the file.
- **Daily backup:** on the first save of each day, the server first copies the existing `journal.json` to `data/backups/journal-YYYY-MM-DD.json`. It keeps the newest 14 backups and deletes older ones.

## 6. Error handling

| Situation | Behaviour |
|---|---|
| Helper not running / save request fails | Red bar: "Not saved — start Journal.bat". Unsaved changes stay in the page and are retried on the next edit or every 10 seconds. |
| Port 8765 already in use | `Journal.bat` assumes the journal is already running and just opens the browser. |
| `journal.json` missing | Server creates it with empty `issues` and `wishlist`, `version` 0. |
| `journal.json` unreadable (invalid JSON) | Server renames it to `journal.broken-YYYY-MM-DD-HHMMSS.json`, starts empty, and the page shows: "Your journal file was damaged and set aside. Restore a copy from data\backups." Nothing is deleted. |
| Two tabs open, stale save | If the `version` sent is not the current one, the server refuses with HTTP 409. The page shows: "This journal was changed in another tab. Reload to continue." and stops autosaving. |
| Leaving the page with unsaved changes | Browser's "Leave site?" prompt appears. |

## 7. Testing

- **Automated (`python -m unittest`):** `tests/test_server.py` runs the server on a free port against a temporary data folder and checks:
  - load when the file is missing creates an empty journal;
  - save then load returns the same data and an incremented version;
  - stale version is refused with 409;
  - invalid JSON file is set aside and an empty journal is returned;
  - first save of a day creates a backup; more than 14 backups are trimmed to 14;
  - the write is atomic (no `.tmp` file left behind after a save).
- **Manual, in the browser:** create, edit, search, archive, unarchive and delete a card; tick a next step and see it in Done with today's date; add, edit, rank by dragging, mark bought, and delete wishlist items; check the rand total; stop the helper and confirm the red bar; open two tabs and confirm the conflict message.

## 8. Project setup

- Lives in `C:\Dev\journal`, a private GitHub repo `KyloKen1/journal`, following the project-hub routine: Status section at the top of the README, Issues on the **My Projects** board, and a row in the `project-hub` README.
- `.gitignore` excludes `data/` (personal content and backups stay only on this PC) and Python cache files.

## 9. Out of scope

Logins, phone or multi-device access, sync, tags or categories, reminders, export to other formats, multiple currencies, rich text formatting.
