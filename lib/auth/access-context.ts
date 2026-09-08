export const ACCESS_ROLES = ['user', 'partner', 'admin', 'super_admin'] as const

export type AccessRole = (typeof ACCESS_ROLES)[number]

export interface AccessContext {
  accessRole: AccessRole
  partnerVenueIds: string[]
}

export interface AccessContextRpcClient {
  rpc(
    name: 'get_access_context' | 'get_server_access_context',
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPECTED_ROW_KEYS = ['access_role', 'partner_venue_ids']

export class AccessContextUnavailableError extends Error {
  constructor() {
    super('Access context is unavailable')
    this.name = 'AccessContextUnavailableError'
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isAccessRole(value: unknown): value is AccessRole {
  return typeof value === 'string' && (ACCESS_ROLES as readonly string[]).includes(value)
}

/**
 * Validates the exact public contract returned by either access-context RPC.
 * Any unexpected field or shape fails closed so a database drift cannot
 * silently turn into a lower-privilege (or higher-privilege) role.
 */
export function parseAccessContextRpcPayload(payload: unknown): AccessContext {
  if (!Array.isArray(payload) || payload.length !== 1 || !isPlainRecord(payload[0])) {
    throw new AccessContextUnavailableError()
  }

  const row = payload[0]
  const keys = Object.keys(row).sort()
  if (
    keys.length !== EXPECTED_ROW_KEYS.length
    || !EXPECTED_ROW_KEYS.every((key, index) => keys[index] === key)
    || !isAccessRole(row.access_role)
    || !Array.isArray(row.partner_venue_ids)
    || !row.partner_venue_ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))
    || new Set(row.partner_venue_ids).size !== row.partner_venue_ids.length
  ) {
    throw new AccessContextUnavailableError()
  }

  return {
    accessRole: row.access_role,
    partnerVenueIds: [...row.partner_venue_ids],
  }
}

function isMissingServerAccessContextRpc(error: unknown): boolean {
  if (!isPlainRecord(error) || typeof error.code !== 'string') return false
  const message = typeof error.message === 'string' ? error.message : ''
  if (!/get_server_access_context/i.test(message)) return false
  return error.code === 'PGRST202' || error.code === '42883'
}

/**
 * Always performs a live routing-only RPC. Do not wrap this function in
 * cache(). During migration rollout, only the exact missing-function error may
 * fall back to the legacy context; every other dependency error fails closed.
 */
export async function getLiveAccessContext(client: AccessContextRpcClient): Promise<AccessContext> {
  let result: { data: unknown; error: unknown }
  try {
    result = await client.rpc('get_server_access_context')
  } catch {
    throw new AccessContextUnavailableError()
  }

  if (result.error) {
    if (!isMissingServerAccessContextRpc(result.error)) {
      throw new AccessContextUnavailableError()
    }
    try {
      result = await client.rpc('get_access_context')
    } catch {
      throw new AccessContextUnavailableError()
    }
    if (result.error) throw new AccessContextUnavailableError()
  }

  return parseAccessContextRpcPayload(result.data)
}
