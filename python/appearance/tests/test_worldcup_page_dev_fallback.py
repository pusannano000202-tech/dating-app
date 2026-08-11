import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORLDCUP_PAGE = ROOT / "app" / "profile" / "worldcup" / "page.tsx"
SELF_WORLDCUP_PAGE = ROOT / "app" / "profile" / "self-worldcup" / "page.tsx"


class TestWorldcupPageDevFallback(unittest.TestCase):
    def test_worldcup_page_requires_saved_basic_profile_gender_in_dev(self):
        source = WORLDCUP_PAGE.read_text(encoding="utf-8")

        self.assertIn("isSupabaseConfigured", source)
        self.assertIn("readDevBasicProfileGender", source)
        self.assertIn("기본정보에서 성별을 먼저 저장해줘.", source)
        self.assertNotIn("setGender('male')", source)
        self.assertIn("loadIdealMetadata()", source)

    def test_worldcup_page_skips_self_worldcup_after_completion(self):
        source = WORLDCUP_PAGE.read_text(encoding="utf-8")
        survey = (ROOT / "app" / "profile" / "survey" / "page.tsx").read_text(encoding="utf-8")

        self.assertNotIn("router.push('/profile/self-worldcup')", source)
        self.assertIn("router.push('/profile/survey')", source)
        self.assertIn("router.push('/profile/photos')", survey)

    def test_self_worldcup_route_is_removed(self):
        self.assertFalse(SELF_WORLDCUP_PAGE.exists())


if __name__ == "__main__":
    unittest.main()
