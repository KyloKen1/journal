<!-- STATUS:START -->
## Status
**Phase:** Playable
**Focus:** No
**Summary:** Personal to-do list, wishlist and private book notes as a web page for PC and phone, with data in a private GitHub repo and Claude suggestions on to-dos each weekday morning.
**Last updated:** 2026-11-11

### Milestones
- [x] Design spec approved
- [x] Implementation plan written
- [x] Data store and server working
- [x] App shell with autosave
- [x] Work tab usable
- [x] Wishlist tab usable
- [x] Price suggestions for wishlist items
- [x] To-do list replaces the Work tab
- [x] Page live on GitHub Pages with data in a private repo
- [x] Tests run before every publish
- [x] Books tab for books read
- [ ] Token set up and checked on PC and phone
- [ ] Used day to day for a week

### Last session
Reviewed the whole project and fixed three findings (tests now run before publishing, a missing data file is no longer reported as a bad token, a background refresh can't roll the page back). Added a Books tab (title, author, percentage read with a progress bar, finished date, liked, disliked) saved to its own `books.json` that Claude's tools refuse to open.

### Next steps
1. Create the access token and check the live page, including the Books tab, on PC and phone (#12)
2. Use the to-do list on PC and phone for a week and list changes (#14)
3. Check wishlist dragging on the phone; add buttons if it doesn't work (#21)

### Blockers
The page needs your GitHub access token on each device before it shows the list (#12).
<!-- STATUS:END -->

# Journal

A personal to-do list and wishlist that runs in the browser, on any device.

- **To-Do:** one running list. Drag an item by its ⠿ handle to put the list in the order you want (arrow up and down on the handle work too). Tick an item to move it to the Completed archive; anything unfinished is still there tomorrow, tagged "carried over". Open an item to see its description, up next steps, a dated progress log and Claude's suggestions on one screen.
- **Work:** a second list for work, kept apart from To-Do and working the same way.
- **Wishlist:** things to buy, ranked by dragging, with prices in rand.
- **Books:** the books you are reading or have read, each with a bar showing how far through you are, and what you liked and what you disliked. These notes are private: they are kept in their own file (`books.json`) that Claude's skills and tools never open.

## Use it

Open **https://kyloken1.github.io/journal/** on the PC or phone (on this PC, `Journal.bat` opens it).

The page itself holds no data. Your list lives in the private repo `KyloKen1/journal-data`, and every save is a commit there, so its history is your backup. The list needs an internet connection.

### Set up a device (once per browser)

The first visit asks for a GitHub access token:

1. On github.com open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Repository access: Only select repositories → `journal-data`.
3. Permissions: Repository permissions → Contents → Read and write.
4. Generate the token, copy it, and paste it into the page.

The token is kept in that browser only and sent only to GitHub. One limit: browser storage is shared by every site under `kyloken1.github.io`, so if you later publish another repo with GitHub Pages on this account, its pages could read the token. Give the token an expiry date, and consider a custom domain for the journal before publishing other Pages sites. **Forget this device** in the top bar removes it. When a token expires, the page asks for a new one and keeps your unsaved edits.

## Claude's suggestions

- **To-Do and Work:** every weekday at 08:00 a scheduled task in the Claude desktop app checks both lists and posts up to two suggestions per open item: a next step, a way to split a big task, or a flag on an item with no progress for 5 days. Open the item to **Add to Up next** or **Dismiss**. Say **"check my to-do list"** in a Claude session in this folder to run it on request. It only runs while this PC is on with the Claude app open, and Claude never edits your items.
- **Wishlist:** say **"update my wishlist"**. Claude asks what you want for each item and your budget (saved as `Want:` / `Budget:` lines at the top of the item's notes), then searches South African shops and posts 2–3 options per item to **Accept** or **Dismiss all**. Nothing is bought or ordered.

## Develop

- `python tools/webtests.py` runs the browser tests in headless Chrome.
- `python -m unittest discover -s tests -t .` runs the data tool's tests.
- `web/test/todo-demo.html` shows the To-Do tab on sample data (serve `web/` with `python -m http.server`).
- Pushing to `main` runs both test suites, then publishes `web/` to GitHub Pages. A failing test stops the publish.

## Docs

- To-do design: `docs/superpowers/specs/2026-11-11-todo-design.md`
- To-do build plan: `docs/superpowers/plans/2026-11-11-todo.md`
- Original journal design and plan: `docs/superpowers/specs/2026-11-03-journal-design.md`, `docs/superpowers/plans/2026-11-03-journal.md`
- Price suggestions design and plan: `docs/superpowers/specs/2026-11-05-wishlist-suggestions-design.md`, `docs/superpowers/plans/2026-11-05-wishlist-suggestions.md`
