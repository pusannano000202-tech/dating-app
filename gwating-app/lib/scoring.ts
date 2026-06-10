import { TraitKey, MemberRole } from "@/types/matching";

const ROLE_WEIGHTS: Record<MemberRole, Record<TraitKey, number>> = {
  moodMaker: {
    atmosphereCoordination: 0.6,
    consideration:          0.0,
    participation:          0.4,
    respectfulness:         0.0,
    communicationBalance:   0.0,
  },
  coordinator: {
    atmosphereCoordination: 0.4,
    consideration:          0.0,
    participation:          0.0,
    respectfulness:         0.0,
    communicationBalance:   0.6,
  },
  considerate: {
    atmosphereCoordination: 0.0,
    consideration:          0.6,
    participation:          0.0,
    respectfulness:         0.4,
    communicationBalance:   0.0,
  },
  reactor: {
    atmosphereCoordination: 0.0,
    consideration:          0.0,
    participation:          0.5,
    respectfulness:         0.0,
    communicationBalance:   0.5,
  },
};

export function classifyRole(traits: Record<TraitKey, number>): MemberRole {
  const roles: MemberRole[] = ["moodMaker", "coordinator", "considerate", "reactor"];
  let best: MemberRole = "coordinator";
  let bestScore = -1;

  for (const role of roles) {
    const weights = ROLE_WEIGHTS[role];
    const score = (Object.keys(weights) as TraitKey[]).reduce(
      (sum, key) => sum + traits[key] * weights[key],
      0
    );
    if (score > bestScore) {
      bestScore = score;
      best = role;
    }
  }
  return best;
}

export type RoleVector = Record<MemberRole, number>;

export function buildRoleVector(members: { role: MemberRole }[]): RoleVector {
  const counts: RoleVector = { moodMaker: 0, coordinator: 0, considerate: 0, reactor: 0 };
  for (const m of members) counts[m.role]++;
  const total = members.length || 1;
  return {
    moodMaker:   counts.moodMaker   / total,
    coordinator: counts.coordinator / total,
    considerate: counts.considerate / total,
    reactor:     counts.reactor     / total,
  };
}

export function roleComplementarityScore(a: RoleVector, b: RoleVector): number {
  const dot =
    a.moodMaker   * b.moodMaker +
    a.coordinator * b.coordinator +
    a.considerate * b.considerate +
    a.reactor     * b.reactor;

  const complementarity = 1 - dot;
  const hasCommonRole = (Object.keys(a) as MemberRole[]).some(
    (r) => a[r] > 0 && b[r] > 0
  );
  return Math.min(1, complementarity + (hasCommonRole ? 0.1 : 0));
}
