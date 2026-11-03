<!-- STATUS:START -->
## Status
**Phase:** Playable
**Focus:** No
**Summary:** Personal journal app for this PC: work issue cards and a ranked wishlist of things to buy.
**Last updated:** 2026-11-03

### Milestones
- [x] Design spec approved
- [x] Implementation plan written
- [x] Data store and server working
- [x] App shell with autosave
- [x] Work tab usable
- [x] Wishlist tab usable
- [ ] Used day to day for a week

### Last session
Designed, built, reviewed and merged the whole app (Work and Wishlist tabs, autosave, daily backups). 20 tests pass; review fixes included two-tab safety and a localhost-only check.

### Next steps
1. Use the journal for a week and list changes (#6)

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
