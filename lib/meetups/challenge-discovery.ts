export function filterDiscoveryChallenges<T extends { category: string }>(
  challenges: readonly T[], category: 'soccer' | 'gaming' | undefined,
): readonly T[] {
  return category ? challenges.filter(challenge => challenge.category === category) : challenges
}
