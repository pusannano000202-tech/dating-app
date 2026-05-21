import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORLDCUP_PAGE = ROOT / "app" / "profile" / "worldcup" / "page.tsx"
SELF_WORLDCUP_PAGE = ROOT / "app" / "profile" / "self-worldcup" / "page.tsx"


class TestWorldcupPageDevFallback(unittest.TestCase):
    def test_worldcup_page_has_placeholder_supabase_fallback(self):
        source = WORLDCUP_PAGE.read_text(encoding="utf-8")

        self.assertIn("isSupabaseConfigured", source)
        self.assertIn("setGender('male')", source)
        self.assertIn("loadIdealMetadata()", source)

    def test_worldcup_page_skips_self_worldcup_after_completion(self):
        source = WORLDCUP_PAGE.read_text(encoding="utf-8")

        self.assertNotIn("router.push('/profile/self-worldcup')", source)
        self.assertIn("router.push('/profile/photos')", source)

    def test_self_worldcup_route_is_removed(self):
        self.assertFalse(SELF_WORLDCUP_PAGE.exists())


if __name__ == "__main__":
    unittest.main()
