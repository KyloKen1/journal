"""Claude's buy suggestions for wishlist items, kept apart from the owner's own journal data."""

import json
import math
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable

from store import JournalStore

MAX_OPTIONS = 3
OPTION_KEYS = ("name", "price", "shop", "link", "note")


class NoSuchItem(Exception):
    """The id is not an unbought item on the wishlist."""


class SuggestionStore:
    def __init__(self, data_dir: Path, journal: JournalStore, now: Callable[[], datetime] = datetime.now):
        self.data_dir = Path(data_dir)
        self.file = self.data_dir / "suggestions.json"
        self.journal = journal
        self.now = now
        self.lock = threading.Lock()

    def load(self) -> dict:
        with self.lock:
            return self._read()

    def put(self, item_id: str, body: dict) -> str:
        options, note = _validate(body)
        wanted = {w["id"] for w in self.journal.load()["wishlist"] if not w.get("bought")}
        if item_id not in wanted:
            raise NoSuchItem(item_id)
        checked = self.now().strftime("%Y-%m-%dT%H:%M:%S")
        with self.lock:
            items = {k: v for k, v in self._read()["items"].items() if k in wanted}
            items[item_id] = {"checked": checked, "note": note, "options": options}
            self._write({"items": items})
        return checked

    def delete(self, item_id: str) -> None:
        with self.lock:
            data = self._read()
            if data["items"].pop(item_id, None) is not None:
                self._write(data)

    def _read(self) -> dict:
        if not self.file.exists():
            return {"items": {}}
        try:
            data = json.loads(self.file.read_text(encoding="utf-8"))
            if not (isinstance(data, dict) and isinstance(data.get("items"), dict)):
                raise ValueError("suggestions file has the wrong shape")
            return data
        except ValueError:
            # Suggestions can always be regenerated, so set the file aside and start empty.
            stamp = self.now().strftime("%Y-%m-%d-%H%M%S")
            self.file.rename(self.data_dir / f"suggestions.broken-{stamp}.json")
            return {"items": {}}

    def _write(self, data: dict) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.file.with_name(self.file.name + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.file)


def _validate(body) -> tuple[list, str]:
    if not isinstance(body, dict):
        raise ValueError("body must be an object")
    options, note = body.get("options"), body.get("note", "")
    if not isinstance(options, list) or len(options) > MAX_OPTIONS or not isinstance(note, str):
        raise ValueError(f"need a list of at most {MAX_OPTIONS} options and a text note")
    return [_clean_option(o) for o in options], note


def _clean_option(option) -> dict:
    if not isinstance(option, dict):
        raise ValueError("each option must be an object")
    name, price, shop, link, note = (option.get(k) for k in OPTION_KEYS)
    if not (isinstance(name, str) and name.strip() and isinstance(shop, str) and shop.strip()):
        raise ValueError("option needs a name and a shop")
    if price is not None and not (type(price) in (int, float) and math.isfinite(price) and price >= 0):
        raise ValueError("price must be a number of 0 or more, or null")
    if not (isinstance(link, str) and link.startswith(("https://", "http://"))):
        raise ValueError("link must start with https:// or http://")
    if not isinstance(note, str):
        raise ValueError("note must be text")
    return {"name": name, "price": price, "shop": shop, "link": link, "note": note}
