import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createServerClient } from '@supabase/ssr'

import { parseRuntimeEnv, SEED_NAMESPACE } from './tonight-local-seed.mjs'

export const APP_ORIGIN = 'http://localhost:3004'

const RUNTIME_ENV_PATH = join('.tmp', 'tonight-live-local', 'runtime-env.json')
const CREDENTIAL_PATH = join('.tmp', 'tonight-live-local', 'seed-credentials.json')
const REQUIRED_ROLES = ['super-admin', 'admin', 'partner', 'user']
const FOREIGN_VENUE_ID = '00000000-0000-4000-8000-000000000001'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PUBLIC_ERROR_PATTERN = /^[a-z][a-z0-9_]{2,63}$/

class LocalVerifyError extends Error {
  constructor(code, detail = '') {
    super(code)
    this.code = code
    this.detail = detail
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new LocalVerifyError(code)
  return value
}

function requiredUuid(value, code) {
  const uuid = requiredString(value, code)
  if (!UUID_PATTERN.test(uuid)) throw new LocalVerifyError(code)
  return uuid
}

function requiredServiceDate(value, code) {
  const serviceDate = requiredString(value, code)
  if (!SERVICE_DATE_PATTERN.test(serviceDate)) throw new LocalVerifyError(code)
  const parsed = new Date(`${serviceDate}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== serviceDate) {
    throw new LocalVerifyError(code)
  }
  return serviceDate
}

function publicErrorCode(payload) {
  const value = isRecord(payload) ? payload.error : null
  return typeof value === 'string' && PUBLIC_ERROR_PATTERN.test(value) ? value : 'unavailable'
}

function safeDetail(parts) {
  return parts
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 240)
}

export function parseVerifierInputs(runtimeInput, credentialInput) {
  const runtime = parseRuntimeEnv(runtimeInput)
  if (
    !isRecord(credentialInput)
    || credentialInput.schema_version !== 1
    || credentialInput.namespace !== SEED_NAMESPACE
    || credentialInput.warning !== 'LOCAL_SYNTHETIC_ONLY_NO_REAL_PAYMENT_NO_REMOTE'
  ) {
    throw new LocalVerifyError('local_verify_credentials_invalid')
  }

  let credentialUrl
  try {
    credentialUrl = new URL(requiredString(
      credentialInput.supabase_url,
      'local_verify_credential_target_invalid',
    ))
  } catch (error) {
    if (error instanceof LocalVerifyError) throw error
    throw new LocalVerifyError('local_verify_credential_target_invalid')
  }
  if (credentialUrl.href !== runtime.url.href) {
    throw new LocalVerifyError('local_verify_credential_target_invalid')
  }

  if (!Array.isArray(credentialInput.accounts)) {
    throw new LocalVerifyError('local_verify_credentials_invalid')
  }
  const sourceAccounts = new Map()
  for (const account of credentialInput.accounts) {
    if (!isRecord(account) || typeof account.label !== 'string' || sourceAccounts.has(account.label)) {
      throw new LocalVerifyError('local_verify_credentials_invalid')
    }
    sourceAccounts.set(account.label, account)
  }

  const accounts = new Map()
  for (const label of REQUIRED_ROLES) {
    const account = sourceAccounts.get(label)
    if (!account) throw new LocalVerifyError('local_verify_credentials_invalid')
    const email = requiredString(account.email, 'local_verify_credentials_invalid')
    if (!email.endsWith('@example.invalid')) {
      throw new LocalVerifyError('local_verify_credentials_invalid')
    }
    accounts.set(label, {
      label,
      email,
      password: requiredString(account.password, 'local_verify_credentials_invalid'),
      id: requiredUuid(account.id, 'local_verify_credentials_invalid'),
    })
  }

  return {
    runtime,
    accounts,
    roundId: requiredUuid(credentialInput.round_id, 'local_verify_round_invalid'),
    venueId: requiredUuid(credentialInput.venue_id, 'local_verify_venue_invalid'),
    serviceDate: requiredServiceDate(
      credentialInput.service_date,
      'local_verify_service_date_invalid',
    ),
  }
}

export function buildProbePlan({ roundId, venueId, foreignVenueId = FOREIGN_VENUE_ID }) {
  const verifiedRoundId = requiredUuid(roundId, 'local_verify_round_invalid')
  const verifiedVenueId = requiredUuid(venueId, 'local_verify_venue_invalid')
  const verifiedForeignVenueId = requiredUuid(foreignVenueId, 'local_verify_venue_invalid')
  if (verifiedForeignVenueId === verifiedVenueId) {
    throw new LocalVerifyError('local_verify_foreign_venue_invalid')
  }
  const actors = ['anonymous', 'user', 'partner', 'admin', 'super-admin']
  const endpoints = [
    {
      name: 'access-context',
      path: '/api/access/context',
      allowed: new Set(['user', 'partner', 'admin', 'super-admin']),
      kind: 'access-context',
    },
    {
      name: 'tonight',
      path: '/api/tonight',
      allowed: new Set(['user']),
      kind: 'tonight',
    },
    {
      name: 'partner-setup',
      path: `/api/partner/tonight/setup?round_id=${encodeURIComponent(verifiedRoundId)}`,
      allowed: new Set(['partner']),
      kind: 'partner-setup',
    },
    {
      name: 'partner-dashboard',
      path: `/api/partner/tonight/dashboard?round_id=${encodeURIComponent(verifiedRoundId)}`,
      allowed: new Set(['partner']),
      kind: 'partner-dashboard',
    },
    {
      name: 'partner-dashboard-owned',
      path: `/api/partner/tonight/dashboard?round_id=${encodeURIComponent(verifiedRoundId)}&venue_id=${encodeURIComponent(verifiedVenueId)}`,
      allowed: new Set(['partner']),
      kind: 'partner-dashboard',
    },
    {
      name: 'partner-dashboard-foreign',
      path: `/api/partner/tonight/dashboard?round_id=${encodeURIComponent(verifiedRoundId)}&venue_id=${encodeURIComponent(verifiedForeignVenueId)}`,
      allowed: new Set(),
      kind: 'partner-dashboard',
      actors: ['partner'],
      expectedStatuses: { partner: 404 },
    },
    {
      name: 'admin-summary',
      path: `/api/admin/tonight/summary?round_id=${encodeURIComponent(verifiedRoundId)}`,
      allowed: new Set(['admin', 'super-admin']),
      kind: 'admin-summary',
    },
    {
      name: 'admin-config',
      path: '/api/admin/config?key=tonight_applications_open',
      allowed: new Set(['super-admin']),
      kind: 'admin-config',
      cookieOnly: true,
    },
  ]

  return endpoints.flatMap((endpoint) => (endpoint.actors || actors).map((actor) => {
    const authenticated = actor !== 'anonymous'
    const expectedStatus = endpoint.expectedStatuses?.[actor]
      ?? (!authenticated ? 401 : endpoint.allowed.has(actor) ? 200 : 403)
    return {
      name: endpoint.name,
      actor,
      method: 'GET',
      path: endpoint.path,
      kind: endpoint.kind,
      expectedStatus,
      expectedError: expectedStatus === 401
        ? 'unauthenticated'
        : expectedStatus === 403
          ? 'forbidden'
          : expectedStatus === 404
            ? 'not_found'
          : null,
      authMode: !authenticated ? 'anonymous' : endpoint.cookieOnly ? 'cookie' : 'bearer',
    }
  }))
}

function normalizedTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function validatePartnerSetupRound(value, inputs) {
  if (!isRecord(value)) throw new LocalVerifyError('local_verify_partner_setup_schedule_invalid')
  const expected = {
    signup_close_at: `${inputs.serviceDate}T09:30:00.000Z`,
    capacity_lock_at: `${inputs.serviceDate}T09:30:00.000Z`,
    allocation_publish_at: `${inputs.serviceDate}T09:32:00.000Z`,
    deposit_due_at: `${inputs.serviceDate}T09:45:00.000Z`,
    partner_acceptance_due_at: `${inputs.serviceDate}T09:50:00.000Z`,
    reveal_at: `${inputs.serviceDate}T09:55:00.000Z`,
    arrival_at: `${inputs.serviceDate}T10:20:00.000Z`,
    starts_at: `${inputs.serviceDate}T10:30:00.000Z`,
  }
  if (
    value.id !== inputs.roundId
    || value.market_code !== 'PNU'
    || value.service_date !== inputs.serviceDate
    || typeof value.status !== 'string'
    || value.status.length === 0
  ) {
    throw new LocalVerifyError('local_verify_partner_setup_schedule_invalid')
  }
  for (const [field, timestamp] of Object.entries(expected)) {
    if (normalizedTimestamp(value[field]) !== timestamp) {
      throw new LocalVerifyError('local_verify_partner_setup_schedule_invalid')
    }
  }
}

async function readJsonFile(path, code) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new LocalVerifyError(code)
  }
}

function createCookieSessionClient(runtime) {
  const cookies = new Map()
  const supabase = createServerClient(runtime.url.href, runtime.publicKey, {
    cookies: {
      getAll() {
        return [...cookies].map(([name, value]) => ({ name, value }))
      },
      setAll(values) {
        for (const { name, value } of values) {
          if (value) cookies.set(name, value)
          else cookies.delete(name)
        }
      },
    },
  })
  return { supabase, cookies }
}

function cookieHeader(cookies) {
  if (!(cookies instanceof Map) || cookies.size === 0) {
    throw new LocalVerifyError('local_verify_cookie_session_missing')
  }
  return [...cookies]
    .map(([name, value]) => {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\u0000-\u001f\u007f;]/.test(value)) {
        throw new LocalVerifyError('local_verify_cookie_session_invalid')
      }
      return `${name}=${value}`
    })
    .join('; ')
}

async function signInRoles(runtime, accounts) {
  const sessions = new Map()
  for (const label of REQUIRED_ROLES) {
    const account = accounts.get(label)
    const local = createCookieSessionClient(runtime)
    const { data, error } = await local.supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    })
    if (error || !data.session?.access_token || data.user?.id !== account.id) {
      const status = typeof error?.status === 'number' ? `auth_status=${error.status}` : ''
      const errorCode = typeof error?.code === 'string' && PUBLIC_ERROR_PATTERN.test(error.code)
        ? `auth_code=${error.code}`
        : ''
      throw new LocalVerifyError(
        'local_verify_sign_in_failed',
        safeDetail([`actor=${label}`, status, errorCode]),
      )
    }
    sessions.set(label, {
      accessToken: data.session.access_token,
      cookie: cookieHeader(local.cookies),
    })
  }
  return sessions
}

function validateSuccessPayload(probe, payload, inputs, metrics) {
  if (!isRecord(payload)) throw new LocalVerifyError('local_verify_response_shape_invalid')
  if (probe.kind === 'access-context') {
    const expectedRole = probe.actor === 'super-admin' ? 'super_admin' : probe.actor
    if (payload.accessRole !== expectedRole || !Array.isArray(payload.partnerVenueIds)) {
      throw new LocalVerifyError('local_verify_response_shape_invalid')
    }
    if (probe.actor === 'partner' && !payload.partnerVenueIds.includes(inputs.venueId)) {
      throw new LocalVerifyError('local_verify_partner_venue_missing')
    }
    metrics.roles[probe.actor] = payload.accessRole
    return
  }
  if (probe.kind === 'tonight') {
    const roundPayload = payload.round
    const round = isRecord(roundPayload) ? roundPayload.round : null
    if (!isRecord(round) || round.id !== inputs.roundId || typeof payload.applications_open !== 'boolean') {
      throw new LocalVerifyError('local_verify_response_shape_invalid')
    }
    metrics.applicationsOpen = payload.applications_open
    return
  }
  if (probe.kind === 'partner-setup') {
    const setup = isRecord(payload.setup) ? payload.setup : null
    if (!setup) throw new LocalVerifyError('local_verify_response_shape_invalid')
    validatePartnerSetupRound(setup.round, inputs)
    metrics.partnerSetupServiceDate = inputs.serviceDate
    return
  }
  if (probe.kind === 'partner-dashboard') {
    if (!Array.isArray(payload.dashboard)) throw new LocalVerifyError('local_verify_response_shape_invalid')
    metrics.partnerDashboardRows = payload.dashboard.length
    return
  }
  if (probe.kind === 'admin-summary') {
    if (!Array.isArray(payload.teams)) throw new LocalVerifyError('local_verify_response_shape_invalid')
    metrics.adminTeamRows = payload.teams.length
    return
  }
  if (
    probe.kind === 'admin-config'
    && payload.key === 'tonight_applications_open'
    && payload.value === true
  ) return
  throw new LocalVerifyError('local_verify_response_shape_invalid')
}

async function runProbe(probe, inputs, sessions, metrics) {
  const url = new URL(probe.path, APP_ORIGIN)
  if (url.origin !== APP_ORIGIN) throw new LocalVerifyError('local_verify_api_target_invalid')
  const headers = { Accept: 'application/json' }
  if (probe.authMode !== 'anonymous') {
    const session = sessions.get(probe.actor)
    if (!session) throw new LocalVerifyError('local_verify_session_missing')
    if (probe.authMode === 'cookie') headers.Cookie = session.cookie
    else headers.Authorization = `Bearer ${session.accessToken}`
  }

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const cause = error instanceof Error && PUBLIC_ERROR_PATTERN.test(error.name.toLowerCase())
      ? `cause=${error.name.toLowerCase()}`
      : ''
    throw new LocalVerifyError(
      'local_verify_request_failed',
      safeDetail([`actor=${probe.actor}`, `endpoint=${probe.name}`, cause]),
    )
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new LocalVerifyError(
      'local_verify_non_json_response',
      safeDetail([
        `actor=${probe.actor}`,
        `endpoint=${probe.name}`,
        `status=${response.status}`,
      ]),
    )
  }

  if (response.status !== probe.expectedStatus) {
    throw new LocalVerifyError(
      response.status >= 500 ? 'local_verify_server_error' : 'local_verify_status_mismatch',
      safeDetail([
        `actor=${probe.actor}`,
        `endpoint=${probe.name}`,
        `expected=${probe.expectedStatus}`,
        `actual=${response.status}`,
        `public_error=${publicErrorCode(payload)}`,
      ]),
    )
  }
  if (probe.expectedError) {
    if (publicErrorCode(payload) !== probe.expectedError) {
      throw new LocalVerifyError(
        'local_verify_error_contract_mismatch',
        safeDetail([`actor=${probe.actor}`, `endpoint=${probe.name}`]),
      )
    }
    return
  }
  try {
    validateSuccessPayload(probe, payload, inputs, metrics)
  } catch (error) {
    if (error instanceof LocalVerifyError) {
      error.detail = safeDetail([`actor=${probe.actor}`, `endpoint=${probe.name}`, error.detail])
    }
    throw error
  }
}

export async function verifyTonightLocalApis({
  runtimeEnvPath = RUNTIME_ENV_PATH,
  credentialPath = CREDENTIAL_PATH,
} = {}) {
  if (process.env.NODE_ENV === 'production') throw new LocalVerifyError('local_runner_production_refused')
  const runtimeInput = await readJsonFile(runtimeEnvPath, 'local_verify_runtime_unreadable')
  const credentialInput = await readJsonFile(credentialPath, 'local_verify_credentials_unreadable')
  const inputs = parseVerifierInputs(runtimeInput, credentialInput)
  const sessions = await signInRoles(inputs.runtime, inputs.accounts)
  const probes = buildProbePlan({ roundId: inputs.roundId, venueId: inputs.venueId })
  const metrics = {
    roles: {},
    applicationsOpen: null,
    partnerSetupServiceDate: null,
    partnerDashboardRows: null,
    adminTeamRows: null,
  }
  for (const probe of probes) await runProbe(probe, inputs, sessions, metrics)
  return { probeCount: probes.length, roleCount: sessions.size, ...metrics }
}

export function summarizeVerifyError(error) {
  const code = error instanceof LocalVerifyError ? error.code : 'local_verify_unexpected_failure'
  const detail = error instanceof LocalVerifyError ? error.detail : ''
  return safeDetail([`code=${code}`, detail ? `detail=${detail}` : ''])
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  try {
    const result = await verifyTonightLocalApis()
    console.log(
      `tonight-local-verify status=pass probes=${result.probeCount} roles=${result.roleCount}`
      + ` applications_open=${result.applicationsOpen}`
      + ` partner_setup_service_date=${result.partnerSetupServiceDate}`
      + ` partner_rows=${result.partnerDashboardRows}`
      + ` admin_teams=${result.adminTeamRows}`,
    )
  } catch (error) {
    console.error(`tonight-local-verify status=fail ${summarizeVerifyError(error)}`)
    process.exitCode = 1
  }
}
