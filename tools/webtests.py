"""Runs the browser test pages in web/test/ in headless Chrome and prints each page's result.

Usage: python tools/webtests.py [page-name ...]     (default: every *-test.html)
Exit code 0 only if every page reports "All N passed".
"""

import html
import re
import subprocess
import sys
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
# Chrome, not Edge: headless Edge prints nothing for --dump-dom on this PC.
BROWSERS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
]


class QuietHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def log_message(self, *args):
        pass


def run_page(browser: Path, url: str) -> str:
    # Its own profile folder, so it never attaches to a browser window the owner has open.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        result = subprocess.run(
            [str(browser), "--headless", "--disable-gpu", "--no-first-run",
             f"--user-data-dir={profile}", "--window-size=1920,1080", "--virtual-time-budget=20000", "--dump-dom", url],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
        )
    match = re.search(r'<pre id="out">(.*?)</pre>', result.stdout, re.S)
    return html.unescape(match.group(1)).strip() if match else "FAIL no output from page"


def main(names: list[str]) -> int:
    browser = next((p for p in BROWSERS if p.exists()), None)
    if browser is None:
        print("Google Chrome not found")
        return 2
    pages = [WEB / "test" / n for n in names] if names else sorted((WEB / "test").glob("*-test.html"))
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(WEB)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    failed = False
    try:
        for page in pages:
            out = run_page(browser, f"http://127.0.0.1:{server.server_address[1]}/test/{page.name}")
            ok = re.fullmatch(r"All \d+ passed", out) is not None
            failed = failed or not ok
            print(f"{'ok  ' if ok else 'FAIL'} {page.name}: {out}")
    finally:
        server.shutdown()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
