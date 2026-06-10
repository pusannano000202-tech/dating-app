import { TeamProfile, MatchResult, MoodKey, MemberRole, TraitKey } from "@/types/matching";
import { mockTeams } from "@/data/mockTeams";
import { rankTeams } from "@/lib/matching";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export type TeamMatchOverview = {
  team: TeamProfile;
  matches: MatchResult[];
};

type TeamRow = {
  id: string;
  team_name: string;
  size: number;
  age_range: string;
  mood: string;
  male_count: number | null;
  female_count: number | null;
};

type MemberRow = {
  team_id: string;
  nickname: string;
  role: string;
  traits: Record<TraitKey, number> | null;
  is_leader: boolean;
  gender: "male" | "female" | null;
};

function mapToTeams(teamRows: TeamRow[], memberRows: MemberRow[]): TeamProfile[] {
  return teamRows.map((t) => ({
    teamName: t.team_name,
    school: "부산대학교",
    region: "부산",
    size: t.size,
    ageRange: t.age_range,
    mood: t.mood as MoodKey,
    maleCount: t.male_count ?? undefined,
    femaleCount: t.female_count ?? undefined,
    members: memberRows
      .filter((m) => m.team_id === t.id)
      .map((m) => ({
        nickname: m.nickname,
        role: m.role as MemberRole,
        traits: m.traits ?? undefined,
        isLeader: m.is_leader,
        gender: m.gender ?? undefined,
      })),
  }));
}

/**
 * 데이터 출처 어댑터. Supabase 설정/조회 성공 시 DB 를 읽고,
 * 아니면 mockTeams 로 폴백한다(빌드·오프라인 안전).
 */
export async function getAllTeams(): Promise<TeamProfile[]> {
  if (!isSupabaseConfigured || !supabase) return mockTeams;
  try {
    const [{ data: teamRows, error: te }, { data: memberRows, error: me }] =
      await Promise.all([
        supabase.from("teams").select("*").order("created_at", { ascending: true }),
        supabase.from("team_members").select("*"),
      ]);
    if (te || me || !teamRows || teamRows.length === 0) return mockTeams;
    return mapToTeams(teamRows as TeamRow[], (memberRows as MemberRow[]) ?? []);
  } catch {
    return mockTeams;
  }
}

export async function getMatchOverview(): Promise<TeamMatchOverview[]> {
  const teams = await getAllTeams();
  return teams.map((team) => ({
    team,
    matches: rankTeams(team, teams.filter((t) => t !== team)),
  }));
}
