"""Claude's access to the journal's private data repo, through the `gh` CLI.

    python -I tools/data.py get <path> <outfile>      download a file; prints its sha
    python -I tools/data.py put <path> <infile> <sha> upload it, based on that sha; prints the new sha

<path> is journal.json or suggestions.json. Exit codes: 0 done, 2 the file's contents were
refused (nothing uploaded), 3 conflict (the file changed since that sha: get it again and
redo the change), 1 anything else.
"""

import base64
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Callable

REPO = "KyloKen1/journal-data"
FILES = ("journal.json", "suggestions.json")  # the only files Claude may read or write
MAX_OPTIONS = 3  # buy options per wishlist item
MAX_SUGGESTIONS = 2  # suggestions per to-do item

Run = Callable[[list[str], str | None], tuple[int, str, str]]


class ToolError(Exception):
    """gh failed; the message is what gh said."""


class Conflict(ToolError):
    """The file changed since the sha the upload was based on."""


def gh_api(args: list[str], stdin: str | None = None) -> tuple[int, str, str]:
    result = subprocess.run(
        ["gh", "api", *args], input=stdin, capture_output=True, text=True, encoding="utf-8",
    )
    return result.returncode, result.stdout, result.stderr


def get(path: str, run: Run = gh_api) -> tuple[str, str]:
    """The file's text and its sha."""
    if path not in FILES:
        # Everything else in the data repo (books.json, for one) is the owner's private notes.
        raise ValueError(f"{path!r} is not Claude's to read: use journal.json or suggestions.json")
    code, out, err = run([f"repos/{REPO}/contents/{path}"], None)
    if code != 0:
        raise ToolError(err.strip() or f"gh exited with {code}")
    file = json.loads(out)
    if file.get("encoding") != "base64" or not file.get("content"):
        raise ToolError(f"{path} has no inline content (too large?)")
    return base64.b64decode(file["content"]).decode("utf-8"), file["sha"]


def put(path: str, text: str, sha: str | None, run: Run = gh_api) -> str:
    """Uploads text as the file, refusing if it changed since sha. No sha creates the file."""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError(f"not valid JSON: {error}") from error
    validate(path, parsed)
    body = {"message": f"Update {path}", "content": base64.b64encode(text.encode("utf-8")).decode("ascii")}
    if sha:
        body["sha"] = sha
    code, out, err = run(["--method", "PUT", f"repos/{REPO}/contents/{path}", "--input", "-"], json.dumps(body))
    if code != 0:
        if "HTTP 409" in err or "HTTP 422" in err:
            raise Conflict(err.strip())
        raise ToolError(err.strip() or f"gh exited with {code}")
    return json.loads(out)["content"]["sha"]


def validate(path: str, data) -> None:
    """Raises ValueError unless data is a well-formed journal.json or suggestions.json."""
    if path == "journal.json":
        if not (isinstance(data, dict) and isinstance(data.get("todos"), list) and isinstance(data.get("wishlist"), list)):
            raise ValueError("journal.json needs a list of todos and a list of wishlist items")
    elif path == "suggestions.json":
        if not (isinstance(data, dict) and isinstance(data.get("items"), dict) and isinstance(data.get("todos"), dict)):
            raise ValueError("suggestions.json needs an items object and a todos object")
        for item_id, entry in data["items"].items():
            _check_wishlist_entry(item_id, entry)
        for todo_id, entry in data["todos"].items():
            _check_todo_entry(todo_id, entry)
    else:
        raise ValueError(f"unknown file {path!r}: use journal.json or suggestions.json")


def _text(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _check_wishlist_entry(item_id: str, entry) -> None:
    where = f"items[{item_id}]"
    if not isinstance(entry, dict):
        raise ValueError(f"{where} must be an object")
    options, note = entry.get("options"), entry.get("note", "")
    if not isinstance(options, list) or len(options) > MAX_OPTIONS or not isinstance(note, str):
        raise ValueError(f"{where} needs a list of at most {MAX_OPTIONS} options and a text note")
    for option in options:
        if not isinstance(option, dict):
            raise ValueError(f"{where}: each option must be an object")
        price, link = option.get("price"), option.get("link")
        if not (_text(option.get("name")) and _text(option.get("shop"))):
            raise ValueError(f"{where}: an option needs a name and a shop")
        if price is not None and not (type(price) in (int, float) and math.isfinite(price) and price >= 0):
            raise ValueError(f"{where}: price must be a number of 0 or more, or null")
        if not (isinstance(link, str) and link.startswith(("https://", "http://"))):
            raise ValueError(f"{where}: link must start with https:// or http://")
        if not isinstance(option.get("note", ""), str):
            raise ValueError(f"{where}: an option's note must be text")


def _check_todo_entry(todo_id: str, entry) -> None:
    where = f"todos[{todo_id}]"
    if not isinstance(entry, dict):
        raise ValueError(f"{where} must be an object")
    suggestions, dismissed = entry.get("suggestions"), entry.get("dismissed")
    if not isinstance(entry.get("checked"), str):
        raise ValueError(f"{where} needs a checked time")
    if not isinstance(suggestions, list) or len(suggestions) > MAX_SUGGESTIONS:
        raise ValueError(f"{where} needs a list of at most {MAX_SUGGESTIONS} suggestions")
    if not (isinstance(dismissed, list) and all(isinstance(d, str) for d in dismissed)):
        raise ValueError(f"{where} needs a dismissed list of texts")
    for suggestion in suggestions:
        if not (isinstance(suggestion, dict) and _text(suggestion.get("id")) and _text(suggestion.get("text"))):
            raise ValueError(f"{where}: a suggestion needs an id and a text")
        steps = suggestion.get("steps")
        if not (isinstance(steps, list) and all(_text(step) for step in steps)):
            raise ValueError(f"{where}: steps must be a list of non-empty texts")


def main(argv: list[str]) -> int:
    try:
        if len(argv) == 3 and argv[0] == "get":
            text, sha = get(argv[1])
            Path(argv[2]).write_text(text, encoding="utf-8", newline="")
            print(sha)
        elif len(argv) == 4 and argv[0] == "put":
            print(put(argv[1], Path(argv[2]).read_text(encoding="utf-8"), argv[3]))
        else:
            print(__doc__)
            return 1
    except ValueError as error:
        print(f"refused: {error}")
        return 2
    except Conflict:
        print("conflict")
        return 3
    except ToolError as error:
        print(f"failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
