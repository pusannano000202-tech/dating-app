import { TeamProfile, MatchResult } from "@/types/matching";
import { mockTeams } from "@/data/mockTeams";
import { rankTeams } from "@/lib/matching";

export type TeamMatchOverview = {
  team: TeamProfile;
  matches: MatchResult[];
};

/**
 * 데이터 출처를 한 곳에 모아둔 어댑터.
 * Supabase 연동 시 이 함수의 구현만 교체하면 관리자 화면은 그대로 동작한다.
 */
export function getAllTeams(): TeamProfile[] {
  return mockTeams;
}

export function getMatchOverview(): TeamMatchOverview[] {
  const teams = getAllTeams();
  return teams.map((team) => ({
    team,
    matches: rankTeams(team, teams.filter((t) => t !== team)),
  }));
}
