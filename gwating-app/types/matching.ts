export type TraitKey =
  | "atmosphereCoordination"
  | "consideration"
  | "participation"
  | "respectfulness"
  | "communicationBalance";

export type MoodKey =
  | "comfortableTalk"
  | "activeSocial"
  | "gamesAndDrinks"
  | "respectfulSafe"
  | "naturalIntro";

export type MemberRole =
  | "moodMaker"
  | "coordinator"
  | "considerate"
  | "reactor";

export type TeamMember = {
  nickname: string;
  role: MemberRole;
  traits?: Record<TraitKey, number>;
  isLeader?: boolean;
};

export type UserProfile = {
  nickname: string;
  traits: Record<TraitKey, number>;
};

export type TeamProfile = {
  teamName: string;
  school: "부산대학교";
  region: "부산";
  size: number;
  ageRange: string;
  mood: MoodKey;
  members: TeamMember[];
};

export type MatchResult = {
  team: TeamProfile;
  score: number;
  vibeScore: number;
  roleScore: number;
  conditionScore: number;
  reasons: string[];
  label: "Strong vibe fit" | "Good with some differences" | "Different atmosphere preferences";
};
