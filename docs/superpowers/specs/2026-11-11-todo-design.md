# To-Do List on Any Device — Design

Date: 2026-11-11
Status: Approved 2026-11-11; updated the same day with three changes made while planning (conversion in the page, a data tool for the skills, 404 treated as a rejected token)
Replaces parts of: `docs/superpowers/specs/2026-11-03-journal-design.md` (Work tab, server, saving)
Changes: `docs/superpowers/specs/2026-11-05-wishlist-suggestions-design.md` (where suggestions are stored)

## 1. Purpose

Turn the journal into a simple to-do list the owner can use from this PC and from their phone, anywhere, with Claude checking the list each weekday morning and posting suggestions.

**Success looks like:** the owner opens one web address on PC or phone, sees the same list, adds and ticks items, and opens any item to a single screen that shows its description, up next, progress and Claude's suggestions.

### What the owner asked for
- A simple to-do list, available on different devices (answered: phone, from anywhere).
- Checked items go to a "Completed" archive.
- Items that are not completed carry over to the next day.
- Click an item to see its details and edit them.
- A description field, a progress field (answered: a dated log of what's done) and an up next section.
- Claude helps with the list: checks it on a schedule (answered: every weekday morning) and posts suggestions in a suggestions section.
- Preferably everything in an open item fits on one 1920×1080 display.

### Decisions the owner made
- The Work tab becomes the To-Do tab; existing Work cards are converted. The Wishlist stays.
- Data is stored in a private GitHub repo.
- The page is served by GitHub Pages, with the app's code public.

### Assumptions
- Still one user. No shared lists.
- Claude only posts suggestions. It never edits, completes or deletes a to-do item.
- The list needs an internet connection. It does not work offline.

## 2. Architecture

The Python server goes away. The page runs entirely in the browser and reads and writes the data through GitHub's API.

```
Phone / PC browser
   │  loads the page from          https://kyloken1.github.io/journal/   (GitHub Pages, public, holds no data)
   │  reads and saves data through https://api.github.com               (with the owner's access token)
   ▼
KyloKen1/journal-data  (private repo)
   journal.json        to-do items and wishlist
   suggestions.json    Claude's suggestions for both
   ▲
   │  gh api (already logged in on this PC)
Claude scheduled task on this PC, weekdays 08:00
```

### Two repos
- **`KyloKen1/journal`** (becomes public): the app's code only. A GitHub Actions workflow publishes the `web/` folder to GitHub Pages on every push to `main`.
- **`KyloKen1/journal-data`** (new, private): the two data files. Every save is a commit, so the repo's history is the backup. The daily backup files are no longer needed.

### Access token
- The first time a device opens the page, it shows a setup screen asking for a GitHub **fine-grained personal access token**. The owner creates it on github.com, limited to the `journal-data` repo only, with one permission: *Contents — read and write*.
- The token is stored in that browser's local storage and sent only to `api.github.com`. A **Forget this device** button removes it.
- The page loads no scripts from other sites, and a content security policy in `index.html` allows network requests only to `api.github.com`, so nothing on this page can send the token anywhere else. Test and demo pages are not published.
- **Limit:** browser storage is shared by every page under `kyloken1.github.io`. If another of the owner's repos is later published with GitHub Pages on this account, its pages could read this token. Today no other repo is. A custom domain for the journal would remove the limit.
- Anyone who opens the public address without a token sees only the setup screen.
- The owner creates and pastes the token. Claude does not handle it.

### Before the code repo goes public
Claude scans the full Git history for personal content (data files, names, email addresses in commits) and reports what it finds. The owner confirms before the visibility is changed. If the history holds something that should stay private, the page is published from a fresh public repo instead and `KyloKen1/journal` stays private.

### Files

```
web/config.js              data repo name and file paths
web/github.js              GitHub storage: load(path) -> {data, sha}; save(path, data, sha) -> sha   (new)
web/token.js               setup screen; store / forget the token                                   (new)
web/todo.js                To-Do tab: list, completed archive, item view                             (replaces work.js)
web/todo-model.js          pure logic: convert a Work card, carried-over days, apply a suggestion    (new)
web/save.js                autosave, now through github.js
web/suggest.js             wishlist suggestions, now through github.js
web/app.js                 start-up, tabs, status messages
web/wishlist.js            unchanged apart from where suggestions load from
web/index.html, style.css  To-Do tab, item view layout, phone layout
web/test/*.html            browser tests (see section 8)
.github/workflows/pages.yml               publish web/ to GitHub Pages
.claude/skills/check-todos/SKILL.md       the morning check procedure                                (new)
.claude/skills/update-wishlist/SKILL.md   reads and writes through gh api instead of localhost
Journal.bat                               opens the web address

tools/data.py                             Claude's read/write access to the data repo, through gh  (new)
tools/webtests.py                         runs the browser tests from the command line             (new)
tests/test_data_tool.py                   tests for tools/data.py                                  (new)
```

Deleted: `server.py`, `store.py`, `suggestions.py` and their tests (Git history keeps them).

## 3. Data

### `journal.json`

```json
{
  "todos": [
    {
      "id": "uuid",
      "title": "Renew car licence",
      "description": "free text",
      "upNext": [{ "id": "uuid", "text": "Book the roadworthy test" }],
      "progress": [{ "id": "uuid", "text": "Found the renewal form", "date": "2026-11-11" }],
      "completed": false,
      "completedDate": null,
      "created": "2026-11-10T09:00:00",
      "updated": "2026-11-11T08:30:00"
    }
  ],
  "wishlist": [ ...unchanged... ]
}
```

- The `version` number is gone. GitHub gives every file version an id (its `sha`); a save must quote the `sha` it was based on, and GitHub refuses it if the file has changed since. That replaces the version check.
- `completedDate` is a `YYYY-MM-DD` date, set when the item is ticked and cleared when it is unticked.

### `suggestions.json`

```json
{
  "items": { ...wishlist suggestions, unchanged... },
  "todos": {
    "<todo id>": {
      "checked": "2026-11-11T08:02:10",
      "suggestions": [
        { "id": "uuid", "text": "Split this into two smaller steps", "steps": ["Book the roadworthy test", "Pay the licence fee online"] },
        { "id": "uuid", "text": "No progress logged for 6 days. Is this still needed?", "steps": [] }
      ],
      "dismissed": ["text of a suggestion the owner dismissed"]
    }
  }
}
```

- `steps` are ready-made Up next entries. A suggestion with no steps is advice only.
- `dismissed` keeps the last 10 dismissed suggestion texts per item, so Claude does not repeat them.

### One-time conversion
At the cutover the existing `data\journal.json` is uploaded to `journal-data` as it is. The first time the page loads a file in the old shape, it converts it and saves it back:

| Work card | To-do item |
|---|---|
| `title` | `title` |
| `details` | `description` |
| `nextSteps` | `upNext` |
| `done` | `progress` |
| `archived: true` | `completed: true`, `completedDate` = date of `updated` |
| `created`, `updated` | unchanged |

Wishlist items and their suggestions are copied as they are. The `data\` folder on this PC is left in place as a fallback copy and is not used again.

## 4. Screens

Tabs: **To-Do** and **Wishlist**. The status line shows "Saved" / "Saving…" / errors, as today.

### To-Do list
- **Add box** at the top: type a title, press Enter. The new item joins the list.
- **Open items**, oldest first, so carried-over items sit at the top. Each row: tick box, title, a **carried over · N days** tag, the first Up next step in grey, and a badge when Claude has suggestions.
- **Carry-over:** the list is one running list, so an unfinished item is still there tomorrow without anything having to run overnight. N is the number of days since the item was added; items added today have no tag.
- **Completed archive:** a "Completed (12)" section below the open items, closed by default. It lists ticked items with their completion date, newest first. Unticking one returns it to the open list.
- Ticking a row moves it to Completed straight away.

### Item view
Clicking a row opens the item across the whole window, replacing the list. **Back** (or Esc) returns to the list.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ← Back   ☐  Renew car licence                 carried over · 3 days    Delete │
├──────────────────────────┬──────────────────────────┬─────────────────────────┤
│ Description              │ Up next                  │ Suggestions             │
│                          │  ☐ Book roadworthy test  │  checked 11 Nov         │
│  (large text box,        │  ☐ Pay fee online        │  ┌───────────────────┐  │
│   fills the column)      │  + add step              │  │ Split this into…  │  │
│                          ├──────────────────────────┤  │ [Add to Up next]  │  │
│                          │ Progress                 │  │ [Dismiss]         │  │
│                          │  11 Nov  Found the form  │  └───────────────────┘  │
│                          │  + add progress          │                         │
└──────────────────────────┴──────────────────────────┴─────────────────────────┘
```

- The view is exactly the height of the window. Each section scrolls inside its own box when its content is long, so the page never scrolls at 1920×1080.
- **Title** is editable in place. The tick box completes the item and returns to the list.
- **Up next:** steps can be added, edited and deleted. Ticking a step moves it to Progress with today's date (as Work cards do today).
- **Progress:** dated entries, newest first. Entries can be added, edited and deleted.
- **Suggestions:** each has **Dismiss**; those with steps also have **Add to Up next**, which appends the steps and removes the suggestion. With no suggestions the column says "No suggestions. Claude checks on weekday mornings."
- **Delete** asks for confirmation.
- **On a phone** (narrow screen) the three columns stack in the order Description, Up next, Progress, Suggestions, and the page scrolls normally.

### Wishlist
No change to how it looks or works.

## 5. Claude's suggestions

### Morning check
- A scheduled task in the Claude desktop app on this PC runs at 08:00, Monday to Friday, in `C:\Dev\journal`, and follows the `check-todos` skill. Saying "check my to-do list" in a Claude session there runs the same skill on request.
- The skill reads `journal.json` and `suggestions.json` from `journal-data` with `tools/data.py` (a small wrapper around `gh api` that also checks the file's shape before uploading), and writes back only `suggestions.json`.
- For each open item it posts at most 2 suggestions, chosen from:
  - a concrete next step, when Up next is empty;
  - a way to split a large or vague item into smaller steps;
  - a flag when nothing has been logged in Progress for 5 or more days;
  - a note when two items look like the same task.
- It skips an item that still has suggestions waiting, and never repeats one listed in `dismissed`.
- It removes suggestions for items that have been completed or deleted.
- It never changes `journal.json`.

**Limit:** the task runs only when this PC is on with the Claude app open. A missed morning is not caught up; the next scheduled run does the check.

### Wishlist price suggestions
Same behaviour as today, still only on request. The `update-wishlist` skill reads and writes through `tools/data.py` instead of the local server, and saves the owner's `Want:` / `Budget:` answers into `journal.json` with a normal `sha`-checked save.

## 6. Saving

- Every edit triggers an autosave about 3 seconds after the last change (was 1 second), so a burst of typing makes one commit, not many. When the page is hidden or closed (switching apps on the phone), a waiting edit is saved at once.
- Saves go to GitHub one at a time. If GitHub refuses a save, the page first checks whether the file really changed: if its own save is already there, or nothing changed, it carries on; only a real change elsewhere is treated as a conflict.
- The page sends the whole `journal.json` with the `sha` it last loaded or saved.
- Accepting or dismissing a suggestion saves `suggestions.json` the same way. If that file changed in the meantime (Claude's morning check ran), the page reloads it, re-applies the removal and saves again.
- When the page regains focus with nothing unsaved, it reloads both files and shows any changes made on another device (as it does today between tabs).

## 7. Error handling

| Situation | Behaviour |
|---|---|
| No token on this device | Setup screen. |
| Token rejected, expired, or not allowed to see the data repo (GitHub answers 401, 403 or 404) | "GitHub did not accept this device's token. Enter a new one." with the setup screen. Unsaved edits stay in the page and are saved once a working token is entered. |
| No connection, or GitHub unreachable | Red bar: "Not saved — no connection. Retrying." Retries every 10 seconds. |
| Cannot load at start-up | Same red bar; the list is not shown until loading succeeds, so nothing is typed onto an empty copy. |
| List changed on another device since this one loaded (GitHub answers 409) | "This list was changed on another device. Reload to continue." The page goes read-only, as it does today. |
| `journal.json` is not valid data | "The saved list could not be read." The page stays read-only and never overwrites the file. Earlier versions are in the `journal-data` history. |
| GitHub asks the page to slow down (403 with a rate limit) | Treated as a GitHub error and retried, not as a bad token. |
| Any other save error | Red bar with GitHub's status code: "Not saved — GitHub error 500. Retrying." (covers Issue #7) |
| Leaving the page with unsaved changes | Browser's "Leave site?" prompt. |

## 8. Testing

Browser test pages in `web/test/`, each showing a pass/fail list. `python tools/webtests.py` runs them all in headless Chrome; `python -m unittest discover -s tests -t .` runs the data tool's tests.

- **`github-test.html`** — `github.js` against a fake `fetch`: load decodes the file and returns its `sha`; save sends the `sha` and returns the new one; text with accents and emoji survives a save and load; 401, 409 and network failure are reported as distinct errors.
- **`todo-model-test.html`** — a Work card converts field by field, including an archived one; carried-over days are 0 for today, 1 for yesterday, and correct across a month end; "Add to Up next" appends the steps and removes the suggestion; dismissing records the text and keeps only the last 10.
- **`save-test.html`** (updated) — autosave through the fake storage: one save per burst of edits, retry after a failure, stop after a conflict.
- **`suggest-store-test.html`**, **`token-test.html`**, **`todo-ui-test.html`** — the suggestions file with conflict retry, the token setup screen, and the To-Do tab's behaviour in the page.
- Existing `format-test.html` and `suggest-test.html` keep passing.

Manual checks on the published page:
- PC at 1920×1080: open an item with long content in every section and confirm the page does not scroll.
- Phone: enter the token, add an item, tick one, open an item, add a step.
- Edit on the phone, then switch to the PC tab and confirm the change appears.
- Edit the same item on both without reloading and confirm the "changed on another device" message.
- Run "check my to-do list" and confirm suggestions appear, **Add to Up next** and **Dismiss** work, and a dismissed suggestion is not posted again on the next run.

## 9. Project housekeeping

- README: new Status milestones, how to open the list, how to set up a device, how suggestions work.
- Issue #8 (lock the data store) no longer applies once the server is gone and is closed as not planned. Issue #7 is covered by section 7. Issues #9 and #11 are unaffected.
- The `project-hub` row is updated with the new summary.

## 10. Out of scope

Offline use, due dates, reminders or notifications, reordering items by dragging, more than one list, tags, sharing with other people, Claude editing or completing items, a catch-up run for a missed morning check.
