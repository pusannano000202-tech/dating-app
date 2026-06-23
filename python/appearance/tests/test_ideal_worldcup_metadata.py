import json
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PUBLIC_IDEAL = ROOT / "public" / "appearance-ideal"


class TestIdealWorldcupMetadata(unittest.TestCase):
    def test_metadata_uses_final_female_64_worldcup_pool(self):
        metadata = json.loads((PUBLIC_IDEAL / "METADATA.json").read_text(encoding="utf-8"))
        final_set = json.loads((PUBLIC_IDEAL / "FINAL_64_USAGE_SET.json").read_text(encoding="utf-8"))

        expected_ids = [item["id"] for item in final_set["items"]]
        active_female = [
            item
            for item in metadata["items"]
            if item["gender"] == "female" and item["status"] == "active"
        ]

        self.assertEqual(len(active_female), 64)
        self.assertEqual([item["id"] for item in active_female], expected_ids)
        self.assertTrue(
            all(item["measured"]["appearance_score_normalized"] <= 77 for item in active_female)
        )

        bucket_counts = Counter(item["final_bucket"] for item in active_female)
        self.assertEqual(sorted(bucket_counts.values()), [8] * 8)

        for item in active_female:
            measured = item["measured"]
            self.assertTrue(measured["appearance_vector"])
            self.assertEqual(measured["primary_type"], item["final_bucket"])
            self.assertEqual(item["matching_vector_source"], "measured.appearance_vector")

    def test_metadata_uses_final_male_64_worldcup_pool(self):
        metadata = json.loads((PUBLIC_IDEAL / "METADATA.json").read_text(encoding="utf-8-sig"))
        final_set = json.loads((PUBLIC_IDEAL / "MALE_FINAL_64_USAGE_SET.json").read_text(encoding="utf-8-sig"))

        expected_ids = [item["id"] for item in final_set["items"]]
        active_male = [
            item
            for item in metadata["items"]
            if item["gender"] == "male" and item["status"] == "active"
        ]

        self.assertEqual(len(active_male), 64)
        self.assertEqual([item["id"] for item in active_male], expected_ids)
        self.assertTrue(
            all(item["measured"]["appearance_score_normalized"] <= 77 for item in active_male)
        )

        bucket_counts = Counter(item["final_bucket"] for item in active_male)
        self.assertEqual(sorted(bucket_counts.values()), [8] * 8)

        for item in active_male:
            measured = item["measured"]
            image_path = ROOT / item["file"]
            self.assertTrue(image_path.exists(), f"missing image file: {item['file']}")
            self.assertTrue(measured["appearance_vector"])
            self.assertEqual(measured["primary_type"], item["final_bucket"])
            self.assertEqual(item["matching_vector_source"], "measured.appearance_vector")


if __name__ == "__main__":
    unittest.main()
