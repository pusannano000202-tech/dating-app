export type DevMatchPreviewStatus = 'pending' | 'confirmed'

export function isDevMatchPreviewId(matchId: string): boolean {
  return matchId.startsWith('dev-match') || matchId.startsWith('dev-solo-')
}

export function isDevSoloMatchPreviewId(matchId: string): boolean {
  return matchId.startsWith('dev-solo-')
}

export function canUseDevMatchPreview(matchId: string, isDevPreviewSession: boolean): boolean {
  return isDevPreviewSession && isDevMatchPreviewId(matchId)
}

export function getDevMatchPreviewStatus(matchId: string): DevMatchPreviewStatus {
  return matchId.includes('pending') ? 'pending' : 'confirmed'
}
