<!-- STATUS:START -->
## Status
**Phase:** Design
**Focus:** No
**Summary:** Personal journal app for this PC: work issue cards and a ranked wishlist of things to buy.
**Last updated:** 2026-11-03

### Milestones
- [x] Design spec approved
- [x] Implementation plan written
- [ ] Data store and server working
- [ ] App shell with autosave
- [ ] Work tab usable
- [ ] Wishlist tab usable

### Last session
Designed the app, wrote the spec and the build plan, and set up the repo, Issues and board.

### Next steps
1. Build the data store that saves journal.json (#1)
2. Add the local server and Journal.bat launcher (#2)
3. Build the app shell with autosave (#3)

### Blockers
None
<!-- STATUS:END -->

# Journal

A personal journal that runs in the browser on this PC.

- **Work:** one card per issue, with details, next steps and a dated "done" list.
- **Wishlist:** things to buy, ranked by dragging, with prices in rand.

## Use it

Double-click `Journal.bat`. Your data is saved to `data\journal.json`, with daily backups in `data\backups\`. The `data` folder stays on this PC and is not uploaded to GitHub.

## Docs

- Design: `docs/superpowers/specs/2026-11-03-journal-design.md`
- Build plan: `docs/superpowers/plans/2026-11-03-journal.md`
