import { TeamProfile, MatchResult, MoodKey } from "@/types/matching";
import { moodWeights } from "@/data/moodWeights";
import { buildRoleVector, roleComplementarityScore } from "@/lib/scoring";

const MOOD_LABELS: Record<MoodKey, string> = {
  comfortableTalk: "편한 대화형",
  activeSocial:    "활발한 친목형",
  gamesAndDrinks:  "게임/술자리형",
  respectfulSafe:  "예의/안전 중시형",
  naturalIntro:    "자연스러운 소개팅형",
};

function calcVibeScore(myMood: MoodKey, theirMood: MoodKey): number {
  return moodWeights[myMood][theirMood];
}

function calcRoleBalanceScore(my: TeamProfile, their: TeamProfile): number {
  return roleComplementarityScore(
    buildRoleVector(my.members),
    buildRoleVector(their.members)
  );
}

function calcConditionScore(my: TeamProfile, their: TeamProfile): number {
  const sizeDiff = Math.abs(my.size - their.size);
  const sizeScore = sizeDiff === 0 ? 1.0 : sizeDiff === 1 ? 0.5 : 0.0;

  const parseRange = (r: string): [number, number] => {
    const [min, max] = r.split("~").map(Number);
    return [min, max];
  };
  const [myMin, myMax] = parseRange(my.ageRange);
  const [thMin, thMax] = parseRange(their.ageRange);
  const ageScore = Math.max(myMin, thMin) <= Math.min(myMax, thMax) ? 1.0 : 0.0;

  return sizeScore * 0.5 + ageScore * 0.5;
}

function scoreToLabel(score: number): MatchResult["label"] {
  if (score >= 80) return "Strong vibe fit";
  if (score >= 60) return "Good with some differences";
  return "Different atmosphere preferences";
}

function generateReasons(
  my: TeamProfile,
  their: TeamProfile,
  vibeRaw: number,
  roleRaw: number,
  condRaw: number
): string[] {
  const reasons: string[] = [];

  if (vibeRaw >= 0.8) {
    reasons.push(`두 팀 모두 ${MOOD_LABELS[my.mood]} 분위기를 선호해요.`);
  } else if (vibeRaw >= 0.5) {
    reasons.push(
      `${MOOD_LABELS[their.mood]}인 상대팀이 여러분의 분위기에 잘 맞춰줄 수 있어요.`
    );
  }

  if (roleRaw >= 0.7) {
    reasons.push("두 팀의 역할 구성이 서로를 잘 보완해요.");
  } else if (roleRaw >= 0.5) {
    reasons.push("상대팀이 초반 어색함을 줄여줄 수 있는 역할을 갖고 있어요.");
  }

  if (condRaw >= 0.75) {
    reasons.push("팀 인원과 나이대가 비슷해 편안한 만남이 될 거예요.");
  } else if (my.size === their.size) {
    reasons.push("팀 인원이 같아서 자리 구성이 자연스러워요.");
  }

  if (reasons.length < 2) {
    reasons.push("두 팀이 가볍고 부담 없는 만남을 만들 수 있어요.");
  }

  return reasons.slice(0, 3);
}

export function calculateMatchScore(
  myTeam: TeamProfile,
  candidate: TeamProfile
): MatchResult {
  const vibeRaw = calcVibeScore(myTeam.mood, candidate.mood);
  const roleRaw = calcRoleBalanceScore(myTeam, candidate);
  const condRaw = calcConditionScore(myTeam, candidate);
  const score = Math.round(vibeRaw * 40 + roleRaw * 35 + condRaw * 25);

  return {
    team:           candidate,
    score,
    vibeScore:      Math.round(vibeRaw * 100),
    roleScore:      Math.round(roleRaw * 100),
    conditionScore: Math.round(condRaw * 100),
    reasons:        generateReasons(myTeam, candidate, vibeRaw, roleRaw, condRaw),
    label:          scoreToLabel(score),
  };
}

export function rankTeams(
  myTeam: TeamProfile,
  candidates: TeamProfile[]
): MatchResult[] {
  return candidates
    .map((c) => calculateMatchScore(myTeam, c))
    .sort((a, b) => b.score - a.score);
}
