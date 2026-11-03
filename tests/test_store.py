import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from store import ConflictError, JournalStore

NOW = datetime(2026, 11, 3, 14, 5, 9)


def empty(version=0):
    return {"version": version, "issues": [], "wishlist": []}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.store = JournalStore(self.dir, now=lambda: NOW)

    def tearDown(self):
        self._tmp.cleanup()

    def test_load_missing_creates_empty(self):
        self.assertEqual(self.store.load(), {**empty(), "damaged": False})
        self.assertTrue((self.dir / "journal.json").exists())

    def test_save_then_load_roundtrip(self):
        data = {"version": 0, "issues": [{"id": "a", "title": "x"}], "wishlist": []}
        self.assertEqual(self.store.save(data), 1)
        loaded = self.store.load()
        self.assertEqual(loaded["issues"][0]["title"], "x")
        self.assertEqual(loaded["version"], 1)

    def test_stale_version_raises_conflict(self):
        self.store.save(empty(0))
        with self.assertRaises(ConflictError):
            self.store.save(empty(0))
        self.assertEqual(self.store.load()["version"], 1)

    def test_bad_shape_raises_value_error(self):
        self.store.load()
        before = (self.dir / "journal.json").read_bytes()
        with self.assertRaises(ValueError):
            self.store.save({"version": 0, "issues": "no", "wishlist": []})
        self.assertEqual((self.dir / "journal.json").read_bytes(), before)

    def test_unicode_roundtrip(self):
        title = "Café ñ 🎮"
        self.store.save({"version": 0, "issues": [{"id": "a", "title": title}], "wishlist": []})
        self.assertEqual(self.store.load()["issues"][0]["title"], title)
        raw = (self.dir / "journal.json").read_bytes().decode("utf-8")
        self.assertIn("Café", raw)

    def test_damaged_file_set_aside(self):
        (self.dir / "journal.json").write_bytes(b"{not json")
        loaded = self.store.load()
        self.assertEqual(loaded, {**empty(), "damaged": True})
        broken = self.dir / "journal.broken-2026-11-03-140509.json"
        self.assertEqual(broken.read_bytes(), b"{not json")
        self.store.save(empty(0))
        self.assertFalse(self.store.load()["damaged"])

    def test_first_save_of_day_backs_up(self):
        self.store.load()
        self.store.save(empty(0))
        self.store.save(empty(1))
        backup = self.dir / "backups" / "journal-2026-11-03.json"
        self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))["version"], 0)

    def test_backups_trimmed_to_14(self):
        backups = self.dir / "backups"
        backups.mkdir()
        for day in range(1, 16):
            (backups / f"journal-2026-10-{day:02d}.json").write_text("{}", encoding="utf-8")
        self.store.load()
        self.store.save(empty(0))
        names = sorted(p.name for p in backups.iterdir())
        self.assertEqual(len(names), 14)
        self.assertNotIn("journal-2026-10-01.json", names)
        self.assertNotIn("journal-2026-10-02.json", names)

    def test_no_tmp_left_after_save(self):
        self.store.save(empty(0))
        self.assertEqual(list(self.dir.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
