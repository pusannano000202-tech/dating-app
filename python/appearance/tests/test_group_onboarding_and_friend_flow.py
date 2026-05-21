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

        self.assertIn("if (!profile?.gender)             redirect('/profile/basic')", home)
        self.assertIn("if (!profile?.appearance_type)    redirect('/profile/worldcup')", home)
        self.assertLess(home.index("redirect('/profile/basic')"), home.index("redirect('/profile/worldcup')"))

        self.assertIn("router.push('/profile/worldcup')", basic)
        self.assertIn("router.push('/profile/photos')", worldcup)

        self.assertLess(progress.index("path: '/profile/basic'"), progress.index("path: '/profile/worldcup'"))
        self.assertLess(progress.index("path: '/profile/worldcup'"), progress.index("path: '/profile/photos'"))
        self.assertIn("?? '/profile/basic'", login)
        self.assertNotIn("?? '/profile/worldcup'", login)

    def test_friend_relationship_tables_exist_before_group_invites(self):
        migration = read("supabase/migrations/20260521_matching_create_core_tables.sql")

        self.assertIn("CREATE TABLE friend_requests", migration)
        self.assertIn("CREATE TABLE friendships", migration)
        self.assertIn("sender_user_id", migration)
        self.assertIn("receiver_user_id", migration)
        self.assertIn("friend_user_id", migration)
        self.assertLess(migration.index("CREATE TABLE friend_requests"), migration.index("CREATE TABLE group_invites"))
        self.assertLess(migration.index("CREATE TABLE friendships"), migration.index("CREATE TABLE group_invites"))

    def test_group_create_screen_is_friend_invite_based(self):
        page = read("app/group/create/page.tsx")

        self.assertIn("친구 추가", page)
        self.assertIn("친구 목록", page)
        self.assertIn("그룹 멤버", page)
        self.assertIn("우리 그룹", page)
        self.assertIn("보증금 결제하고 이번 주 매칭 큐에 들어가기", page)
        self.assertNotIn("개발 중", page)

    def test_matching_pool_uses_weekly_queue_not_orbs_or_dots(self):
        component = read("components/MatchingPool.tsx")
        landing = read("app/page.tsx")

        self.assertIn("주간 매칭 큐", component)
        self.assertIn("대기 그룹", component)
        self.assertIn("토요일 14:00", component)
        self.assertNotIn("SoulOrb", component)
        self.assertNotIn("ORBS", component)
        self.assertNotIn("rounded-full bg-emerald", component)
        self.assertIn("MatchingPool", landing)


if __name__ == "__main__":
    unittest.main()
