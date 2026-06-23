export type DevMatchPreviewStatus = 'pending' | 'confirmed'

export function getDevMatchPreviewStatus(matchId: string): DevMatchPreviewStatus {
  return matchId.includes('pending') ? 'pending' : 'confirmed'
}
