import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from store import JournalStore
from suggestions import NoSuchItem, SuggestionStore

NOW = datetime(2026, 11, 9, 8, 4, 12)
OPT = {
    "name": "Logitech G413 SE",
    "price": 899.0,
    "shop": "Takealot",
    "link": "https://www.takealot.com/x",
    "note": "Cheapest in stock",
}


def wish(item_id, bought=False):
    return {"id": item_id, "name": item_id, "price": None, "link": "", "notes": "", "bought": bought}


class SuggestionStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.journal = JournalStore(self.dir, now=lambda: NOW)
        self.journal.save({"version": 0, "issues": [], "wishlist": [wish("a"), wish("b"), wish("c", bought=True)]})
        self.store = SuggestionStore(self.dir, self.journal, now=lambda: NOW)

    def tearDown(self):
        self._tmp.cleanup()

    def test_load_missing_is_empty(self):
        self.assertEqual(self.store.load(), {"items": {}})

    def test_put_then_load(self):
        self.assertEqual(self.store.put("a", {"options": [OPT]}), "2026-11-09T08:04:12")
        self.assertEqual(
            self.store.load()["items"]["a"],
            {"checked": "2026-11-09T08:04:12", "note": "", "options": [OPT]},
        )

    def test_zero_options_with_note(self):
        self.store.put("a", {"options": [], "note": "Too vague"})
        entry = self.store.load()["items"]["a"]
        self.assertEqual(entry["note"], "Too vague")
        self.assertEqual(entry["options"], [])

    def test_four_options_rejected(self):
        with self.assertRaises(ValueError):
            self.store.put("a", {"options": [OPT] * 4})
        self.assertEqual(self.store.load()["items"], {})

    def test_bad_fields_rejected(self):
        bad_options = [
            {"name": ""}, {"shop": ""}, {"price": "899"}, {"price": -5},
            {"price": float("nan")}, {"price": float("inf")}, {"price": True},
            {"link": "javascript:alert(1)"}, {"link": "takealot.com"}, {"note": 5},
        ]
        for change in bad_options:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.store.put("a", {"options": [{**OPT, **change}]})
        with self.assertRaises(ValueError):
            self.store.put("a", {"options": "x"})
        self.assertEqual(self.store.load()["items"], {})

    def test_null_price_allowed(self):
        self.store.put("a", {"options": [{**OPT, "price": None}]})
        self.assertIsNone(self.store.load()["items"]["a"]["options"][0]["price"])

    def test_extra_keys_dropped(self):
        self.store.put("a", {"options": [{**OPT, "evil": 1}]})
        self.assertEqual(self.store.load()["items"]["a"]["options"], [OPT])

    def test_unknown_or_bought_item_rejected(self):
        for item_id in ("zzz", "c"):
            with self.subTest(item_id=item_id), self.assertRaises(NoSuchItem):
                self.store.put(item_id, {"options": [OPT]})

    def test_stale_entries_removed_on_put(self):
        self.store.put("a", {"options": [OPT]})
        self.store.put("b", {"options": [OPT]})
        self.journal.save({"version": 1, "issues": [], "wishlist": [wish("a")]})
        self.store.put("a", {"options": [OPT]})
        self.assertEqual(list(self.store.load()["items"]), ["a"])

    def test_delete_is_idempotent(self):
        self.store.put("a", {"options": [OPT]})
        self.store.delete("a")
        self.store.delete("a")
        self.assertEqual(self.store.load()["items"], {})

    def test_damaged_file_set_aside(self):
        (self.dir / "suggestions.json").write_bytes(b"{bad")
        self.assertEqual(self.store.load(), {"items": {}})
        self.assertEqual((self.dir / "suggestions.broken-2026-11-09-080412.json").read_bytes(), b"{bad")

    def test_no_tmp_left_after_put(self):
        self.store.put("a", {"options": [OPT]})
        self.assertEqual(list(self.dir.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
