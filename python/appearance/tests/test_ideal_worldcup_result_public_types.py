import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULT_COMPONENT = ROOT / "components" / "profile" / "IdealWorldcupResult.tsx"


class TestIdealWorldcupResultPublicTypes(unittest.TestCase):
    def test_result_exposes_public_primary_secondary_types(self):
        source = RESULT_COMPONENT.read_text(encoding="utf-8")

        self.assertIn("getPublicPreferenceTypes", source)
        self.assertIn("primaryType", source)
        self.assertIn("secondaryType", source)
        self.assertNotIn("INTERNAL", source)


if __name__ == "__main__":
    unittest.main()
