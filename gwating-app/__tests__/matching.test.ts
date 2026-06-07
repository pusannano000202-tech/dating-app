import { calculateMatchScore, rankTeams, isGenderCompatible } from "@/lib/matching";
import { TeamProfile } from "@/types/matching";

const myTeam: TeamProfile = {
  teamName: "내팀",
  school: "부산대학교",
  region: "부산",
  size: 3,
  ageRange: "22~23",
  mood: "comfortableTalk",
  members: [
    { nickname: "나", role: "coordinator", isLeader: true,
      traits: { atmosphereCoordination: 4, consideration: 4, participation: 3, respectfulness: 5, communicationBalance: 5 } },
    { nickname: "친구1", role: "considerate" },
    { nickname: "친구2", role: "reactor" },
  ],
};

const sameMoodTeam: TeamProfile = {
  teamName: "비슷한팀",
  school: "부산대학교",
  region: "부산",
  size: 3,
  ageRange: "22~23",
  mood: "comfortableTalk",
  members: [
    { nickname: "가", role: "moodMaker", isLeader: true,
      traits: { atmosphereCoordination: 4, consideration: 3, participation: 4, respectfulness: 4, communicationBalance: 3 } },
    { nickname: "나", role: "reactor" },
    { nickname: "다", role: "reactor" },
  ],
};

const differentMoodTeam: TeamProfile = {
  teamName: "다른팀",
  school: "부산대학교",
  region: "부산",
  size: 3,
  ageRange: "22~23",
  mood: "gamesAndDrinks",
  members: [
    { nickname: "가", role: "moodMaker", isLeader: true,
      traits: { atmosphereCoordination: 5, consideration: 2, participation: 5, respectfulness: 2, communicationBalance: 3 } },
    { nickname: "나", role: "reactor" },
    { nickname: "다", role: "reactor" },
  ],
};

describe("calculateMatchScore", () => {
  it("returns score between 0 and 100", () => {
    const result = calculateMatchScore(myTeam, sameMoodTeam);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("same mood gives higher vibeScore than different mood", () => {
    const sameMood = calculateMatchScore(myTeam, sameMoodTeam);
    const diffMood = calculateMatchScore(myTeam, differentMoodTeam);
    expect(sameMood.vibeScore).toBeGreaterThan(diffMood.vibeScore);
  });

  it("provides 2-3 reasons", () => {
    const result = calculateMatchScore(myTeam, sameMoodTeam);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    expect(result.reasons.length).toBeLessThanOrEqual(3);
  });

  it("label is 'Strong vibe fit' when score >= 80", () => {
    const result = calculateMatchScore(myTeam, sameMoodTeam);
    if (result.score >= 80) {
      expect(result.label).toBe("Strong vibe fit");
    }
  });
});

describe("rankTeams", () => {
  it("returns teams sorted by score descending", () => {
    const ranked = rankTeams(myTeam, [differentMoodTeam, sameMoodTeam]);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});

const makeTeam = (male: number, female: number): TeamProfile => ({
  teamName: "test",
  school: "부산대학교",
  region: "부산",
  size: male + female,
  ageRange: "22~24",
  mood: "comfortableTalk",
  members: [
    ...Array(male).fill({ nickname: "m", role: "moodMaker" as const, gender: "male" as const }),
    ...Array(female).fill({ nickname: "f", role: "reactor" as const, gender: "female" as const }),
  ],
  maleCount: male,
  femaleCount: female,
});

describe("isGenderCompatible", () => {
  test("3남0여 + 0남3여 → 합산 3:3 → compatible", () => {
    expect(isGenderCompatible(makeTeam(3, 0), makeTeam(0, 3))).toBe(true);
  });
  test("2남1여 + 1남2여 → 합산 3:3 → compatible", () => {
    expect(isGenderCompatible(makeTeam(2, 1), makeTeam(1, 2))).toBe(true);
  });
  test("2남1여 + 2남1여 → 합산 4:2 → incompatible", () => {
    expect(isGenderCompatible(makeTeam(2, 1), makeTeam(2, 1))).toBe(false);
  });
  test("gender 없는 팀 → 항상 compatible (하위 호환)", () => {
    const noGenderTeam: TeamProfile = makeTeam(0, 0);
    noGenderTeam.maleCount = undefined;
    noGenderTeam.femaleCount = undefined;
    expect(isGenderCompatible(noGenderTeam, makeTeam(1, 2))).toBe(true);
  });
});
