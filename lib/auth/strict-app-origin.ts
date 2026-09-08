/**
 * Parses an application origin without silently canonicalizing configuration.
 * Callers choose their own failure contract (empty value versus an exception).
 */
export function parseStrictAppOrigin(configuredOrigin: string | null | undefined): URL | null {
  const value = configuredOrigin?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol)
      || url.origin !== value
      || url.pathname !== '/'
      || url.search
      || url.hash
      || url.username
      || url.password
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}
