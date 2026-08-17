import { getPostLoginDestination } from './redirect'

export type QuantumOAuthProvider = 'google' | 'kakao'

const PROVIDER_LABELS: Record<QuantumOAuthProvider, string> = {
  google: 'Google',
  kakao: '카카오',
}

export function getOAuthCallbackUrl(origin: string, destination: string): string {
  const callbackUrl = new URL('/auth/callback', origin)
  callbackUrl.searchParams.set('next', getPostLoginDestination({ requestedRedirect: destination }))
  return callbackUrl.toString()
}

export function getOAuthLoginErrorMessage(
  provider: QuantumOAuthProvider,
  error: unknown
): string {
  const providerLabel = PROVIDER_LABELS[provider]
  const providerMessage = error instanceof Error ? error.message.trim() : ''
  const message = `${providerLabel} \ub85c\uadf8\uc778\uc744 \uc644\ub8cc\ud558\uc9c0 \ubabb\ud588\uc5b4\uc694. \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.`
  const normalizedMessage = providerMessage.toLowerCase()

  if (
    normalizedMessage.includes('unsupported provider') ||
    normalizedMessage.includes('provider is not enabled')
  ) {
    return `${providerLabel} 로그인이 아직 준비되지 않았어요. 이메일로 계속해줘.`
  }

  return message || `${providerLabel} 로그인으로 이동하지 못했어요. 다시 시도해줘.`
}

export function getOAuthCallbackErrorMessage(errorCode?: string | null): string {
  if (errorCode === 'access_denied') {
    return '로그인이 취소됐어요. 다시 시도해 주세요.'
  }

  return '로그인을 완료하지 못했어요. 다시 시도해 주세요.'
}
