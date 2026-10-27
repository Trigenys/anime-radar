"""Tests du synchroniseur (stdlib uniquement) ; les cas sont partagés avec test/domain.test.mts."""
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from telegram_sync import dedupe, extract  # noqa: E402

FIXTURES = json.loads((ROOT / "test" / "fixtures" / "telegram-posts.json").read_text(encoding="utf-8"))
DATE = datetime(2026, 10, 27, 10, tzinfo=timezone.utc)


class ExtractTest(unittest.TestCase):
    def test_shared_fixtures(self):
        for case in FIXTURES:
            with self.subTest(case["name"]):
                result = extract(case["text"], DATE, "ch", "1", None)
                if case["expected"] is None:
                    self.assertIsNone(result)
                    continue
                self.assertIsNotNone(result)
                for key in ("title", "episode", "season", "language", "quality"):
                    self.assertEqual(result.get(key), case["expected"].get(key), key)

    def test_rejects_untrusted_links(self):
        self.assertNotIn("url", extract("Frieren - 12", DATE, "ch", "1", "https://evil.example"))
        self.assertEqual(extract("Frieren - 12", DATE, "ch", "1", "https://t.me/chan/12")["url"], "https://t.me/chan/12")


class DedupeTest(unittest.TestCase):
    def item(self, title, episode=4, season=None, source="ch", posted="2026-10-27T10:00:00+00:00"):
        data = {"id": title, "title": title, "episode": episode, "postedAt": posted, "source": source}
        if season is not None:
            data["season"] = season
        return data

    def test_card_and_file_captions_collapse(self):
        items = [self.item("Gensou Suikoden nom"), self.item("Gensou Suikoden", season=1), self.item("Gensou Suikoden nom")]
        self.assertEqual([i["title"] for i in dedupe(items)], ["Gensou Suikoden"])

    def test_keeps_distinct_episodes_seasons_and_sources(self):
        items = [self.item("Bleach", 10, 2), self.item("Bleach", 10, 3), self.item("Bleach", 11, 2),
                 self.item("Bleach", 10, 2, source="other")]
        self.assertEqual(len(dedupe(items)), 4)


if __name__ == "__main__":
    unittest.main()
