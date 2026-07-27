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
        survey = read("app/profile/survey/page.tsx")
        progress = read("components/profile/StepProgress.tsx")
        login = read("app/(auth)/login/page.tsx")
        redirect = read("lib/auth/redirect.ts")

        self.assertIn("if (!profile?.gender) return '/profile/basic'", home)
        self.assertIn("if (!profile.appearance_type) return '/profile/worldcup'", home)
        self.assertIn("if (profile.big5_openness == null) return '/profile/survey'", home)
        self.assertLess(home.index("return '/profile/basic'"), home.index("return '/profile/worldcup'"))
        self.assertLess(home.index("return '/profile/worldcup'"), home.index("return '/profile/survey'"))

        self.assertIn("router.push('/profile/worldcup')", basic)
        self.assertIn("router.push('/profile/survey')", worldcup)
        self.assertIn("router.push('/profile/photos')", survey)

        self.assertLess(progress.index("path: '/profile/basic'"), progress.index("path: '/profile/worldcup'"))
        self.assertLess(progress.index("path: '/profile/worldcup'"), progress.index("path: '/profile/survey'"))
        self.assertLess(progress.index("path: '/profile/survey'"), progress.index("path: '/profile/photos'"))
        self.assertIn("getPostLoginDestination", login)
        self.assertIn("requestedRedirect", login)
        self.assertIn("return '/profile/basic'", redirect)
        self.assertNotIn("return '/profile/worldcup'", redirect)

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
        invite_panel = read("components/matching/group-create/InviteFriendPanel.tsx")
        member_panel = read("components/matching/group-create/GroupMemberStatusPanel.tsx")
        queue_panel = read("components/matching/group-create/FreeBetaQueuePanel.tsx")

        self.assertIn("InviteFriendPanel", page)
        self.assertIn("GroupMemberStatusPanel", page)
        self.assertIn("FreeBetaQueuePanel", page)
        self.assertIn("친구 초대하기", invite_panel)
        self.assertIn("그룹 멤버", member_panel)
        self.assertIn("이번 주 매칭 큐에 들어가기", queue_panel)
        self.assertIn("가매칭이 잡힌 뒤", queue_panel)
        self.assertNotIn("개발 중", page + invite_panel + member_panel + queue_panel)

    def test_matching_pool_uses_weekly_queue_not_orbs_or_dots(self):
        component = read("components/MatchingPool.tsx")
        landing = read("app/page.tsx")

        self.assertIn("이번 주 과팅 대기", component)
        self.assertIn("남자 그룹", component)
        self.assertIn("토요일 14:00", component)
        self.assertNotIn("SoulOrb", component)
        self.assertNotIn("ORBS", component)
        self.assertNotIn("rounded-full bg-emerald", component)
        self.assertNotIn("MatchingPool", landing)


if __name__ == "__main__":
    unittest.main()
