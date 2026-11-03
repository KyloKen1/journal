"""Reads and writes the journal data file: versioned saves, atomic writes, daily backups."""

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Callable

KEEP_BACKUPS = 14


class ConflictError(Exception):
    """The save was based on an older version than the one on disk."""


class JournalStore:
    def __init__(self, data_dir: Path, now: Callable[[], datetime] = datetime.now):
        self.data_dir = Path(data_dir)
        self.file = self.data_dir / "journal.json"
        self.backups = self.data_dir / "backups"
        self.now = now
        self.damaged = False

    def load(self) -> dict:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if not self.file.exists():
            self._write({"version": 0, "issues": [], "wishlist": []})
        try:
            data = json.loads(self.file.read_text(encoding="utf-8"))
            _check_shape(data)
        except ValueError:
            stamp = self.now().strftime("%Y-%m-%d-%H%M%S")
            self.file.rename(self.data_dir / f"journal.broken-{stamp}.json")
            self.damaged = True
            data = {"version": 0, "issues": [], "wishlist": []}
            self._write(data)
        return {**data, "damaged": self.damaged}

    def save(self, data: dict) -> int:
        _check_shape(data)
        current = self.load()["version"]
        if data["version"] != current:
            raise ConflictError(f"saved from version {data['version']}, file is at {current}")
        self._backup()
        new_version = current + 1
        self._write({"version": new_version, "issues": data["issues"], "wishlist": data["wishlist"]})
        self.damaged = False
        return new_version

    def _write(self, data: dict) -> None:
        tmp = self.file.with_name(self.file.name + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.file)

    def _backup(self) -> None:
        self.backups.mkdir(exist_ok=True)
        today = self.backups / f"journal-{self.now():%Y-%m-%d}.json"
        if not today.exists():
            shutil.copyfile(self.file, today)
        for old in sorted(self.backups.glob("journal-*.json"))[:-KEEP_BACKUPS]:
            old.unlink()


def _check_shape(data) -> None:
    if not (
        isinstance(data, dict)
        and type(data.get("version")) is int
        and isinstance(data.get("issues"), list)
        and isinstance(data.get("wishlist"), list)
    ):
        raise ValueError("journal data must have an int version and lists of issues and wishlist")
