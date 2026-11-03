"""Local journal server: serves the app from web/ and the data file through /api/data."""

import json
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from store import ConflictError, JournalStore

ROOT = Path(__file__).resolve().parent
PORT = 8765


class JournalHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
    }

    def __init__(self, *args, store: JournalStore, web_dir: Path, **kwargs):
        self.store = store
        self.web_dir = web_dir.resolve()
        super().__init__(*args, directory=str(web_dir), **kwargs)

    def parse_request(self):
        # Only answer requests addressed to this machine, so a web page on another domain
        # can't reach the journal by pointing its DNS at 127.0.0.1 (DNS rebinding).
        if not super().parse_request():
            return False
        port = self.server.server_address[1]
        if self.headers.get("Host", "") not in (f"localhost:{port}", f"127.0.0.1:{port}"):
            self.send_error(403)
            return False
        return True

    def do_GET(self):
        if self.path.split("?")[0] == "/api/data":
            self.send_json(200, self.store.load())
        else:
            super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/data":
            self.send_json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            version = self.store.save(data)
        except ConflictError:
            self.send_json(409, {"error": "conflict"})
        except ValueError:  # includes invalid JSON and bad UTF-8
            self.send_json(400, {"error": "bad request"})
        else:
            self.send_json(200, {"version": version})

    def translate_path(self, path):
        # Anything that resolves outside web/ maps to a file that doesn't exist, so it 404s.
        resolved = Path(super().translate_path(path)).resolve()
        if resolved != self.web_dir and self.web_dir not in resolved.parents:
            return str(self.web_dir / "__not_found__")
        return str(resolved)

    def end_headers(self):
        # Always revalidate app files, so an updated app isn't masked by a cached copy.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


class ExclusiveServer(ThreadingHTTPServer):
    # HTTPServer reuses addresses, which on Windows lets a second copy share the port silently.
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def make_server(data_dir: Path, web_dir: Path, port: int) -> ThreadingHTTPServer:
    handler = partial(JournalHandler, store=JournalStore(data_dir), web_dir=Path(web_dir))
    return ExclusiveServer(("127.0.0.1", port), handler)


def main() -> None:
    try:
        server = make_server(ROOT / "data", ROOT / "web", PORT)
    except OSError:
        print("Journal is already running.")
        sys.exit(0)
    print(f"Journal running at http://localhost:{PORT} — close this window to stop it.")
    server.serve_forever()


if __name__ == "__main__":
    main()
