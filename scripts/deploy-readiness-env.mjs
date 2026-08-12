export function classifyAiServerUrl(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return 'MISSING'
  if (isPlaceholderValue(normalized)) return 'INVALID'

  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    return 'INVALID'
  }

  if (parsed.protocol !== 'https:') return 'ACTION_REQUIRED'
  if (!parsed.hostname || parsed.username || parsed.password) return 'INVALID'
  return 'SET'
}

export function classifyAiServerSecret(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return 'MISSING'
  if (isPlaceholderValue(normalized) || normalized.length < 32) return 'INVALID'
  return 'SET'
}

function isPlaceholderValue(value) {
  return /(?:your-|your_|example|placeholder|replace_me|changeme|<[^>]+>)/i.test(value)
}
