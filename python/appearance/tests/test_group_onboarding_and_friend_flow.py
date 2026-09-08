import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class TestGroupOnboardingAndFriendFlow(unittest.TestCase):
    def test_onboarding_routes_basic_info_before_worldcup(self):
        home = read("app/page.tsx")
        basic = read("app/profile/basic/page.tsx")
        worldcup = read("app/profile/worldcup/page.tsx")
        progress = read("components/profile/StepProgress.tsx")
        login = read("app/(auth)/login/page.tsx")
        redirect = read("lib/auth/redirect.ts")

        self.assertIn("if (!profile?.gender) return '/profile/basic'", home)
        self.assertIn("if (!profile.appearance_type) return '/profile/worldcup'", home)
        self.assertLess(
            home.index("return '/profile/basic'"),
            home.index("return '/profile/worldcup'"),
        )

        self.assertIn("router.push('/profile/worldcup')", basic)
        self.assertIn("router.push('/profile/photos')", worldcup)
        self.assertNotIn("router.push('/profile/survey')", worldcup)

        self.assertLess(progress.index("path: '/profile/basic'"), progress.index("path: '/profile/worldcup'"))
        self.assertLess(progress.index("path: '/profile/worldcup'"), progress.index("path: '/profile/photos'"))
        self.assertIn("getPostLoginDestination", login)
        self.assertIn("return '/profile/basic'", redirect)

    def test_friend_relationship_tables_exist_before_group_invites(self):
        migration = read("supabase/migrations/20260521000001_matching_create_core_tables.sql")

        self.assertIn("CREATE TABLE friend_requests", migration)
        self.assertIn("CREATE TABLE friendships", migration)
        self.assertIn("sender_user_id", migration)
        self.assertIn("receiver_user_id", migration)
        self.assertIn("friend_user_id", migration)
        self.assertLess(migration.index("CREATE TABLE friend_requests"), migration.index("CREATE TABLE group_invites"))
        self.assertLess(migration.index("CREATE TABLE friendships"), migration.index("CREATE TABLE group_invites"))

    def test_group_create_screen_is_friend_invite_based(self):
        page = read("app/group/create/page.tsx")
        self.assertIn("친구 초대", page)
        self.assertIn("현재 함께하는 친구", page)
        self.assertIn("GroupMemberStatusPanel", page)
        self.assertIn("QueueRadarCard", page)
        self.assertNotIn("개발 중", page)

    def test_matching_landing_uses_event_first_discovery(self):
        component = read("components/matching/QuantumMatchDiscovery.tsx")
        landing = read("app/page.tsx")

        self.assertIn("오늘 바로", component)
        self.assertIn("날짜 골라 만나기", component)
        self.assertIn("QuantumHomeParticipation", landing)
        self.assertIn("QuantumHomeRecommendations", landing)
        self.assertNotIn("MatchingPool", landing)


if __name__ == "__main__":
    unittest.main()
