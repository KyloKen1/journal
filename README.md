<!-- STATUS:START -->
## Status
**Phase:** Playable
**Focus:** No
**Summary:** Personal journal app for this PC: work issue cards and a ranked wishlist of things to buy, with Claude price suggestions on request.
**Last updated:** 2026-11-05

### Milestones
- [x] Design spec approved
- [x] Implementation plan written
- [x] Data store and server working
- [x] App shell with autosave
- [x] Work tab usable
- [x] Wishlist tab usable
- [x] Price suggestions for wishlist items
- [ ] Used day to day for a week

### Last session
Added Claude price suggestions: on "update my wishlist" Claude asks what you want and your budget (saved in notes), then posts 2–3 SA shop options per item to Accept or Dismiss. First real run done on all 6 items; 39 tests pass.

### Next steps
1. Use the journal for a week and list changes (#6)

### Blockers
None
<!-- STATUS:END -->

# Journal

A personal to-do list and wishlist that runs in the browser, on any device.

- **To-Do:** one running list. Tick an item to move it to the Completed archive; anything unfinished is still there tomorrow, tagged "carried over". Open an item to see its description, up next steps, a dated progress log and Claude's suggestions on one screen.
- **Wishlist:** things to buy, ranked by dragging, with prices in rand.

## Use it

Open **https://kyloken1.github.io/journal/** on the PC or phone (on this PC, `Journal.bat` opens it).

The page itself holds no data. Your list lives in the private repo `KyloKen1/journal-data`, and every save is a commit there, so its history is your backup. The list needs an internet connection.

### Set up a device (once per browser)

The first visit asks for a GitHub access token:

1. On github.com open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Repository access: Only select repositories → `journal-data`.
3. Permissions: Repository permissions → Contents → Read and write.
4. Generate the token, copy it, and paste it into the page.

The token is kept in that browser only and sent only to GitHub. **Forget this device** in the top bar removes it. When a token expires, the page asks for a new one and keeps your unsaved edits.

## Claude's suggestions

- **To-Do:** every weekday at 08:00 a scheduled task in the Claude desktop app checks the list and posts up to two suggestions per open item: a next step, a way to split a big task, or a flag on an item with no progress for 5 days. Open the item to **Add to Up next** or **Dismiss**. Say **"check my to-do list"** in a Claude session in this folder to run it on request. It only runs while this PC is on with the Claude app open, and Claude never edits your items.
- **Wishlist:** say **"update my wishlist"**. Claude asks what you want for each item and your budget (saved as `Want:` / `Budget:` lines at the top of the item's notes), then searches South African shops and posts 2–3 options per item to **Accept** or **Dismiss all**. Nothing is bought or ordered.

## Develop

- `python tools/webtests.py` runs the browser tests in headless Chrome.
- `python -m unittest discover -s tests -t .` runs the data tool's tests.
- `web/test/todo-demo.html` shows the To-Do tab on sample data (serve `web/` with `python -m http.server`).
- Pushing to `main` publishes `web/` to GitHub Pages.

## Docs

- To-do design: `docs/superpowers/specs/2026-11-11-todo-design.md`
- To-do build plan: `docs/superpowers/plans/2026-11-11-todo.md`
- Original journal design and plan: `docs/superpowers/specs/2026-11-03-journal-design.md`, `docs/superpowers/plans/2026-11-03-journal.md`
- Price suggestions design and plan: `docs/superpowers/specs/2026-11-05-wishlist-suggestions-design.md`, `docs/superpowers/plans/2026-11-05-wishlist-suggestions.md`
