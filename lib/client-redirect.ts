export function getSafeClientRedirect(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return fallback
  return redirect
}

export function getSequentialMatchStartRedirect(nextPath: string, fallback: string): string {
  const redirect = getSafeClientRedirect(fallback)
  if (redirect !== '/match/start') return redirect
  return `${nextPath}?redirect=${encodeURIComponent('/match/start')}`
}

