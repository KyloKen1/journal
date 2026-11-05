import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from server import make_server


class ServerTestCase(unittest.TestCase):
    """Starts a server on a free port against a temporary data folder."""

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


class ServerTests(ServerTestCase):
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

    def test_foreign_host_rejected(self):
        # Blocks DNS-rebinding: a web page on another domain pointed at 127.0.0.1.
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request("GET", "/api/data", headers={"Host": f"evil.example:{self.port}"})
        resp = conn.getresponse()
        resp.read()
        conn.close()
        self.assertEqual(resp.status, 403)

    def test_localhost_host_allowed(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request("GET", "/api/data", headers={"Host": f"localhost:{self.port}"})
        resp = conn.getresponse()
        resp.read()
        conn.close()
        self.assertEqual(resp.status, 200)

    def test_second_server_on_same_port_fails(self):
        with self.assertRaises(OSError):
            make_server(Path(self._tmp.name) / "data", Path(self._tmp.name) / "web", self.port)

    def test_path_traversal_404(self):
        self.request("GET", "/api/data")  # creates data/journal.json
        for path in ("/../data/journal.json", "/%2e%2e/data/journal.json"):
            resp, _ = self.request("GET", path)
            self.assertEqual(resp.status, 404, path)


OPTION = {"name": "Kingston 16GB DDR4", "price": 649, "shop": "Evetech", "link": "https://www.evetech.co.za/x", "note": ""}


class SuggestionApiTests(ServerTestCase):
    def setUp(self):
        super().setUp()
        item = {"id": "a", "name": "RAM", "price": None, "link": "", "notes": "", "bought": False}
        self.put({"version": 0, "issues": [], "wishlist": [item]})

    def put_suggestions(self, item_id, body):
        text = body if isinstance(body, str) else json.dumps(body)
        return self.request("PUT", f"/api/suggestions/{item_id}", text.encode("utf-8"))

    def version(self):
        return json.loads(self.request("GET", "/api/data")[1])["version"]

    def test_get_suggestions_empty(self):
        resp, data = self.request("GET", "/api/suggestions")
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(data), {"items": {}})

    def test_put_suggestions_then_get(self):
        resp, data = self.put_suggestions("a", {"options": [OPTION]})
        self.assertEqual(resp.status, 200)
        self.assertIn("checked", json.loads(data))
        _, data = self.request("GET", "/api/suggestions")
        self.assertEqual(json.loads(data)["items"]["a"]["options"], [OPTION])

    def test_put_suggestions_unknown_item_404(self):
        resp, data = self.put_suggestions("zzz", {"options": [OPTION]})
        self.assertEqual(resp.status, 404)
        self.assertEqual(json.loads(data), {"error": "no such item"})

    def test_put_suggestions_bad_body_400(self):
        self.assertEqual(self.put_suggestions("a", {"options": [OPTION] * 4})[0].status, 400)
        self.assertEqual(self.put_suggestions("a", "not json")[0].status, 400)

    def test_put_suggestions_odd_ids_404(self):
        before = self.version()
        for item_id in ("", "..%2fjournal.json", "a/b"):
            resp, _ = self.put_suggestions(item_id, {"options": [OPTION]})
            self.assertEqual(resp.status, 404, item_id)
        self.assertEqual(self.version(), before)

    def test_delete_suggestions(self):
        self.put_suggestions("a", {"options": [OPTION]})
        resp, data = self.request("DELETE", "/api/suggestions/a")
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(data), {})
        self.assertEqual(json.loads(self.request("GET", "/api/suggestions")[1]), {"items": {}})
        self.assertEqual(self.request("DELETE", "/api/suggestions/a")[0].status, 200)

    def test_suggestions_do_not_change_journal_version(self):
        before = self.version()
        self.put_suggestions("a", {"options": [OPTION]})
        self.assertEqual(self.version(), before)


if __name__ == "__main__":
    unittest.main()
