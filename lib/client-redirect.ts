export function getSafeClientRedirect(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return fallback
  return redirect
}

