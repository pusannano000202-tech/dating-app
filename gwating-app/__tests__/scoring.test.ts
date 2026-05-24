import { classifyRole, buildRoleVector, roleComplementarityScore } from "@/lib/scoring";
import { TraitKey } from "@/types/matching";

const highAtmParticipation: Record<TraitKey, number> = {
  atmosphereCoordination: 5,
  consideration: 1,
  participation: 5,
  respectfulness: 1,
  communicationBalance: 1,
};

const highConsiderationRespect: Record<TraitKey, number> = {
  atmosphereCoordination: 1,
  consideration: 5,
  participation: 1,
  respectfulness: 5,
  communicationBalance: 1,
};

const highCommBalance: Record<TraitKey, number> = {
  atmosphereCoordination: 2,
  consideration: 1,
  participation: 2,
  respectfulness: 1,
  communicationBalance: 5,
};

describe("classifyRole", () => {
  it("high atmosphereCoordination+participation → moodMaker", () => {
    expect(classifyRole(highAtmParticipation)).toBe("moodMaker");
  });

  it("high consideration+respectfulness → considerate", () => {
    expect(classifyRole(highConsiderationRespect)).toBe("considerate");
  });

  it("high communicationBalance → coordinator", () => {
    expect(classifyRole(highCommBalance)).toBe("coordinator");
  });
});

describe("buildRoleVector", () => {
  it("normalizes role counts to fractions", () => {
    const members = [
      { role: "moodMaker" as const },
      { role: "moodMaker" as const },
      { role: "reactor" as const },
      { role: "reactor" as const },
    ];
    const v = buildRoleVector(members);
    expect(v.moodMaker).toBeCloseTo(0.5);
    expect(v.reactor).toBeCloseTo(0.5);
    expect(v.coordinator).toBe(0);
    expect(v.considerate).toBe(0);
  });
});

describe("roleComplementarityScore", () => {
  it("identical teams score lower than complementary teams", () => {
    const allMoodMaker = buildRoleVector([
      { role: "moodMaker" }, { role: "moodMaker" },
    ]);
    const allConsiderate = buildRoleVector([
      { role: "considerate" }, { role: "considerate" },
    ]);
    const sameSame = roleComplementarityScore(allMoodMaker, allMoodMaker);
    const diff = roleComplementarityScore(allMoodMaker, allConsiderate);
    expect(diff).toBeGreaterThan(sameSame);
  });
});
