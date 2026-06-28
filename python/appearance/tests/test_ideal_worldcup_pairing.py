import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
IDEAL_WORLDCUP = ROOT / "components" / "profile" / "IdealWorldcup.tsx"


class TestIdealWorldcupPairing(unittest.TestCase):
    def test_pairing_uses_bucket_aware_matching(self):
        source = IDEAL_WORLDCUP.read_text(encoding="utf-8")

        self.assertIn("pairUpBucketAware", source)
        self.assertIn("candidate.final_bucket !== left.final_bucket", source)


if __name__ == "__main__":
    unittest.main()
