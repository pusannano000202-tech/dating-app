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

export function classifyTonightNoShowForfeitPolicy(cardPaymentsEnabled, policyApproved) {
  if (cardPaymentsEnabled !== 'true') return 'SET'
  return policyApproved === 'true' ? 'SET' : 'ACTION_REQUIRED'
}

export function classifyTonightAutomationEnabled(value, phase) {
  if (phase === 'launch') return value === 'true' ? 'SET' : 'ACTION_REQUIRED'
  if (phase === 'predeploy') return value === 'false' ? 'SET' : 'ACTION_REQUIRED'
  return 'INVALID'
}

export function classifyTonightLaunchFlag(value, phase) {
  if (phase === 'launch') return value === 'true' ? 'SET' : 'ACTION_REQUIRED'
  if (phase === 'predeploy') return value === 'false' ? 'SET' : 'ACTION_REQUIRED'
  return 'INVALID'
}

export function classifyTonightDatabaseGate(value, phase) {
  if (phase === 'launch') return value === true ? 'SET' : 'ACTION_REQUIRED'
  if (phase === 'predeploy') return value === false ? 'SET' : 'ACTION_REQUIRED'
  return 'INVALID'
}

export function parseDeployReadinessPhase(args) {
  const phaseArgs = args.filter((argument) => argument.startsWith('--phase='))
  if (phaseArgs.length === 0) return 'predeploy'
  if (phaseArgs.length !== 1) throw new Error('invalid_readiness_phase')
  if (phaseArgs[0] === '--phase=predeploy') return 'predeploy'
  if (phaseArgs[0] === '--phase=launch') return 'launch'
  throw new Error('invalid_readiness_phase')
}

export function buildSupabaseServiceRequestHeaders(serviceKey) {
  const headers = {
    apikey: serviceKey,
    'Content-Type': 'application/json',
  }
  if (!String(serviceKey).startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${serviceKey}`
  }
  return headers
}

function isPlaceholderValue(value) {
  return /(?:your-|your_|example|placeholder|replace_me|changeme|<[^>]+>)/i.test(value)
}
