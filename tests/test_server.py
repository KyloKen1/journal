import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from server import make_server


class ServerTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        web = root / "web"
        web.mkdir()
        (web / "index.html").write_text("<h1>hi</h1>", encoding="utf-8")
        (web / "a.js").write_text("x", encoding="utf-8")
        self.server = make_server(root / "data", web, 0)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self._tmp.cleanup()

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request(method, path, body=body)
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp, data

    def put(self, obj_or_text):
        body = obj_or_text if isinstance(obj_or_text, str) else json.dumps(obj_or_text)
        return self.request("PUT", "/api/data", body.encode("utf-8"))

    def test_get_data_empty(self):
        resp, data = self.request("GET", "/api/data")
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(data)["version"], 0)

    def test_put_then_get(self):
        resp, data = self.put({"version": 0, "issues": [{"id": "a", "title": "x"}], "wishlist": []})
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(data), {"version": 1})
        _, data = self.request("GET", "/api/data")
        self.assertEqual(json.loads(data)["issues"][0]["title"], "x")

    def test_put_stale_409(self):
        self.put({"version": 0, "issues": [], "wishlist": []})
        resp, data = self.put({"version": 0, "issues": [], "wishlist": []})
        self.assertEqual(resp.status, 409)
        self.assertEqual(json.loads(data), {"error": "conflict"})

    def test_put_invalid_json_400(self):
        resp, _ = self.put("not json")
        self.assertEqual(resp.status, 400)
        _, data = self.request("GET", "/api/data")
        self.assertEqual(json.loads(data)["version"], 0)

    def test_put_bad_shape_400(self):
        resp, _ = self.put({"version": 0, "issues": 5, "wishlist": []})
        self.assertEqual(resp.status, 400)

    def test_index_served(self):
        resp, data = self.request("GET", "/")
        self.assertEqual(resp.status, 200)
        self.assertIn(b"<h1>hi</h1>", data)

    def test_js_content_type(self):
        resp, _ = self.request("GET", "/a.js")
        self.assertTrue(resp.getheader("Content-Type").startswith("text/javascript"))

    def test_second_server_on_same_port_fails(self):
        with self.assertRaises(OSError):
            make_server(Path(self._tmp.name) / "data", Path(self._tmp.name) / "web", self.port)

    def test_path_traversal_404(self):
        self.request("GET", "/api/data")  # creates data/journal.json
        for path in ("/../data/journal.json", "/%2e%2e/data/journal.json"):
            resp, _ = self.request("GET", path)
            self.assertEqual(resp.status, 404, path)


if __name__ == "__main__":
    unittest.main()
