import base64
import copy
import json
import unittest

from tools import data


def b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


class FakeGh:
    """Stands in for `gh api`: records each call and returns scripted (code, stdout, stderr)."""

    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    def __call__(self, args, stdin=None):
        self.calls.append((args, stdin))
        return self.results.pop(0)


def valid_suggestions() -> dict:
    return {
        "items": {
            "w1": {
                "checked": "2026-11-09T08:04:12",
                "note": "",
                "options": [{"name": "Kingston 16GB", "price": 649, "shop": "Evetech", "link": "https://x.co/r", "note": ""}],
            }
        },
        "todos": {
            "t1": {
                "checked": "2026-11-11T08:02:10",
                "suggestions": [{"id": "g1", "text": "Split it", "steps": ["a", "b"]}, {"id": "g2", "text": "Stalled", "steps": []}],
                "dismissed": ["old one"],
            }
        },
    }


class GetTests(unittest.TestCase):
    def test_get_decodes_utf8_and_returns_sha(self):
        text = json.dumps({"title": "Café ☕"}, ensure_ascii=False)
        wrapped = "\n".join(b64(text)[i:i + 20] for i in range(0, len(b64(text)), 20))
        gh = FakeGh((0, json.dumps({"sha": "abc", "encoding": "base64", "content": wrapped}), ""))
        got, sha = data.get("journal.json", gh)
        self.assertEqual(got, text)
        self.assertEqual(sha, "abc")
        self.assertEqual(gh.calls[0][0], ["repos/KyloKen1/journal-data/contents/journal.json"])

    def test_get_failure_raises_with_ghs_message(self):
        gh = FakeGh((1, "", "gh: Not Found (HTTP 404)"))
        with self.assertRaises(data.ToolError) as caught:
            data.get("journal.json", gh)
        self.assertIn("404", str(caught.exception))


class PutTests(unittest.TestCase):
    def test_put_uploads_base64_with_the_sha(self):
        text = json.dumps({"todos": [], "wishlist": [{"name": "Café ☕"}]}, ensure_ascii=False)
        gh = FakeGh((0, json.dumps({"content": {"sha": "def"}}), ""))
        new_sha = data.put("journal.json", text, "abc", gh)
        self.assertEqual(new_sha, "def")
        args, stdin = gh.calls[0]
        self.assertEqual(args, ["--method", "PUT", "repos/KyloKen1/journal-data/contents/journal.json", "--input", "-"])
        body = json.loads(stdin)
        self.assertEqual(body["sha"], "abc")
        self.assertEqual(body["message"], "Update journal.json")
        self.assertEqual(base64.b64decode(body["content"]).decode("utf-8"), text)

    def test_put_without_a_sha_creates_the_file(self):
        gh = FakeGh((0, json.dumps({"content": {"sha": "first"}}), ""))
        data.put("journal.json", '{"todos": [], "wishlist": []}', None, gh)
        self.assertNotIn("sha", json.loads(gh.calls[0][1]))

    def test_put_conflict_raises_conflict(self):
        for message in ("gh: journal.json does not match abc (HTTP 409)", "gh: Invalid request (HTTP 422)"):
            gh = FakeGh((1, "", message))
            with self.assertRaises(data.Conflict):
                data.put("journal.json", '{"todos": [], "wishlist": []}', "abc", gh)

    def test_put_other_failure_raises_tool_error_not_conflict(self):
        gh = FakeGh((1, "", "gh: Server Error (HTTP 500)"))
        with self.assertRaises(data.ToolError) as caught:
            data.put("journal.json", '{"todos": [], "wishlist": []}', "abc", gh)
        self.assertNotIsInstance(caught.exception, data.Conflict)

    def test_put_refuses_invalid_data_without_calling_gh(self):
        gh = FakeGh()
        with self.assertRaises(ValueError):
            data.put("journal.json", '{"todos": "nope", "wishlist": []}', "abc", gh)
        with self.assertRaises(ValueError):
            data.put("journal.json", "not json {", "abc", gh)
        self.assertEqual(gh.calls, [])

    def test_put_refuses_unknown_files(self):
        with self.assertRaises(ValueError):
            data.put("other.json", "{}", "abc", FakeGh())


class ValidateTests(unittest.TestCase):
    def rejects(self, change):
        doc = valid_suggestions()
        change(doc)
        with self.assertRaises(ValueError):
            data.validate("suggestions.json", doc)

    def test_valid_suggestions_pass(self):
        data.validate("suggestions.json", valid_suggestions())
        data.validate("suggestions.json", {"items": {}, "todos": {}})

    def test_sections_must_be_objects(self):
        self.rejects(lambda d: d.update(items=[]))
        self.rejects(lambda d: d.pop("todos"))

    def test_wishlist_rules(self):
        option = lambda d: d["items"]["w1"]["options"][0]
        self.rejects(lambda d: d["items"]["w1"].update(options=[copy.deepcopy(option(d)) for _ in range(4)]))
        self.rejects(lambda d: option(d).update(name="  "))
        self.rejects(lambda d: option(d).update(shop=""))
        self.rejects(lambda d: option(d).update(price=-1))
        self.rejects(lambda d: option(d).update(price="649"))
        self.rejects(lambda d: option(d).update(link="javascript:alert(1)"))
        self.rejects(lambda d: option(d).update(note=None))
        self.rejects(lambda d: d["items"]["w1"].update(note=5))

    def test_wishlist_price_may_be_null(self):
        doc = valid_suggestions()
        doc["items"]["w1"]["options"][0]["price"] = None
        data.validate("suggestions.json", doc)

    def test_todo_rules(self):
        entry = lambda d: d["todos"]["t1"]
        extra = {"id": "g3", "text": "Third", "steps": []}
        self.rejects(lambda d: entry(d)["suggestions"].append(extra))
        self.rejects(lambda d: entry(d).update(checked=None))
        self.rejects(lambda d: entry(d)["suggestions"][0].update(id=""))
        self.rejects(lambda d: entry(d)["suggestions"][0].update(text="  "))
        self.rejects(lambda d: entry(d)["suggestions"][0].update(steps="a"))
        self.rejects(lambda d: entry(d)["suggestions"][0].update(steps=["a", ""]))
        self.rejects(lambda d: entry(d).update(dismissed=[1]))
        self.rejects(lambda d: entry(d).pop("dismissed"))
        self.rejects(lambda d: d["todos"].update(t2="text"))

    def test_journal_needs_both_lists(self):
        data.validate("journal.json", {"todos": [], "wishlist": []})
        for bad in ({"todos": []}, {"wishlist": []}, {"todos": {}, "wishlist": []}, [], None):
            with self.assertRaises(ValueError):
                data.validate("journal.json", bad)


if __name__ == "__main__":
    unittest.main()
