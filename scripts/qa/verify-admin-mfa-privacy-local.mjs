import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { QA, qaSql, readQaStatus } from './option2-local-environment.mjs'

if (process.argv.length !== 2) throw new Error('no_arguments_allowed')

const status = readQaStatus()
const clientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
}
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, clientOptions)
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
const password = `${randomBytes(24).toString('base64url')}aA1!`
const results = []

function record(name, passed, detail = 'ok') {
  results.push({ name, passed, detail })
  if (!passed) throw new Error(`${name}:${detail}`)
}

function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '')) {
    throw new Error(`invalid_${label}`)
  }
  return value
}

function decodeJwtPayload(token) {
  const part = token?.split('.')[1]
  if (!part) throw new Error('invalid_access_token')
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = secret.toUpperCase().replace(/=+$/u, '').replace(/[^A-Z2-7]/gu, '')
  let bits = ''
  for (const char of clean) {
    const index = alphabet.indexOf(char)
    if (index < 0) throw new Error('invalid_totp_secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function totp(secret, offset = 0) {
  const counter = BigInt(Math.floor(Date.now() / 30_000) + offset)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(counter)
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest()
  const position = digest[digest.length - 1] & 0x0f
  const code = (digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000
  return code.toString().padStart(6, '0')
}

async function createUser(label, metadata = {}) {
  const email = `qa-${label}-${suffix}@example.test`
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error || !data.user?.id) throw new Error(`create_${label}_failed`)
  const id = assertUuid(data.user.id, `${label}_user_id`)
  const client = createClient(status.API_URL, status.ANON_KEY, clientOptions)
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error || !signed.data.session?.access_token) throw new Error(`signin_${label}_failed`)
  return { id, client, accessToken: signed.data.session.access_token }
}

async function callRpc(accessToken, name, args = {}) {
  const response = await fetch(`${status.API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: status.ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  return { ok: response.ok, status: response.status, payload }
}

function expectRpcOk(name, response, predicate = () => true) {
  const passed = response.ok && predicate(response.payload)
  record(name, passed, passed ? 'ok' : response.ok ? 'unexpected_payload' : `http_${response.status}`)
}

function expectRpcError(name, response, expected) {
  const message = typeof response.payload?.message === 'string' ? response.payload.message : ''
  const passed = !response.ok && message.includes(expected)
  record(name, passed, passed ? 'expected_rejection' : response.ok ? 'unexpected_success' : `http_${response.status}`)
}

async function elevateToAal2(account) {
  const enrolled = await account.client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `qa-${randomBytes(5).toString('hex')}`,
  })
  if (enrolled.error || !enrolled.data?.id || !enrolled.data?.totp?.secret) throw new Error('mfa_enroll_failed')
  const challenged = await account.client.auth.mfa.challenge({ factorId: enrolled.data.id })
  if (challenged.error || !challenged.data?.id) throw new Error('mfa_challenge_failed')
  let verified
  for (const offset of [0, -1, 1]) {
    verified = await account.client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenged.data.id,
      code: totp(enrolled.data.totp.secret, offset),
    })
    if (!verified.error && verified.data?.access_token) break
  }
  if (verified?.error || !verified?.data?.access_token) throw new Error('mfa_verify_failed')
  account.accessToken = verified.data.access_token
  const claims = decodeJwtPayload(account.accessToken)
  if (claims.aal !== 'aal2') throw new Error('aal2_claim_missing')
  return account
}

function insertAdmin(userId, role = 'admin') {
  qaSql(`insert into public.admins(user_id,role,granted_by,notes) values('${assertUuid(userId, 'admin_id')}'::uuid,'${role}','${userId}'::uuid,'isolated local QA') on conflict(user_id) do update set role=excluded.role;`)
}

const activeAdmin = await createUser('active-admin')
insertAdmin(activeAdmin.id)
const absentRoundId = randomUUID()
const absentExceptionKey = `2026090800:01:no_show:${randomUUID()}`

const routingAtAal1 = await callRpc(activeAdmin.accessToken, 'get_server_access_context')
expectRpcOk('aal1-routing-sees-live-admin', routingAtAal1, value => value?.[0]?.access_role === 'admin')
expectRpcError('aal1-direct-admin-rpc-denied', await callRpc(activeAdmin.accessToken, 'verify_admin_aal2_session'), 'mfa_required')
expectRpcError('aal1-sensitive-admin-rpc-denied', await callRpc(activeAdmin.accessToken, 'admin_get_tonight_exception_detail', { p_round_id: absentRoundId, p_exception_key: absentExceptionKey }), 'admin_required')
expectRpcOk('aal1-effective-role-is-user', await callRpc(activeAdmin.accessToken, 'get_access_context'), value => value?.[0]?.access_role === 'user')
await elevateToAal2(activeAdmin)
expectRpcOk('aal2-direct-admin-rpc-allowed', await callRpc(activeAdmin.accessToken, 'verify_admin_aal2_session'), value => value === true)
expectRpcOk('aal2-sensitive-admin-rpc-reaches-reader', await callRpc(activeAdmin.accessToken, 'admin_get_tonight_exception_detail', { p_round_id: absentRoundId, p_exception_key: absentExceptionKey }), value => Array.isArray(value) && value.length === 0)
expectRpcOk('aal2-effective-role-is-admin', await callRpc(activeAdmin.accessToken, 'get_access_context'), value => value?.[0]?.access_role === 'admin')

const activeSuperAdmin = await createUser('active-super-admin')
insertAdmin(activeSuperAdmin.id, 'super_admin')
expectRpcOk('aal1-routing-sees-live-super-admin', await callRpc(activeSuperAdmin.accessToken, 'get_server_access_context'), value => value?.[0]?.access_role === 'super_admin')
expectRpcError('aal1-direct-super-admin-rpc-denied', await callRpc(activeSuperAdmin.accessToken, 'verify_admin_aal2_session'), 'mfa_required')
expectRpcOk('aal1-super-admin-effective-role-is-user', await callRpc(activeSuperAdmin.accessToken, 'get_access_context'), value => value?.[0]?.access_role === 'user')
await elevateToAal2(activeSuperAdmin)
expectRpcOk('aal2-direct-super-admin-rpc-allowed', await callRpc(activeSuperAdmin.accessToken, 'verify_admin_aal2_session'), value => value === true)
expectRpcOk('aal2-effective-role-is-super-admin', await callRpc(activeSuperAdmin.accessToken, 'get_access_context'), value => value?.[0]?.access_role === 'super_admin')

qaSql(`delete from public.admins where user_id='${activeAdmin.id}'::uuid;`)
expectRpcError('live-role-revocation-denied', await callRpc(activeAdmin.accessToken, 'verify_admin_aal2_session'), 'admin_required')
expectRpcOk('routing-role-revocation-is-user', await callRpc(activeAdmin.accessToken, 'get_server_access_context'), value => value?.[0]?.access_role === 'user')

const revokedSessionAdmin = await createUser('revoked-session-admin')
insertAdmin(revokedSessionAdmin.id)
await elevateToAal2(revokedSessionAdmin)
const revokedSessionId = assertUuid(decodeJwtPayload(revokedSessionAdmin.accessToken).session_id, 'revoked_session_id')
qaSql(`delete from auth.sessions where id='${revokedSessionId}'::uuid;`)
expectRpcError('revoked-session-denied', await callRpc(revokedSessionAdmin.accessToken, 'verify_admin_aal2_session'), 'mfa_required')

const expiredSessionAdmin = await createUser('expired-session-admin')
insertAdmin(expiredSessionAdmin.id)
await elevateToAal2(expiredSessionAdmin)
const expiredSessionId = assertUuid(decodeJwtPayload(expiredSessionAdmin.accessToken).session_id, 'expired_session_id')
qaSql(`update auth.sessions set not_after=clock_timestamp()-interval '1 minute' where id='${expiredSessionId}'::uuid;`)
expectRpcError('expired-session-denied', await callRpc(expiredSessionAdmin.accessToken, 'verify_admin_aal2_session'), 'mfa_required')

const bannedAdmin = await createUser('banned-admin')
insertAdmin(bannedAdmin.id)
await elevateToAal2(bannedAdmin)
qaSql(`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${bannedAdmin.id}'::uuid;`)
expectRpcError('banned-user-session-denied', await callRpc(bannedAdmin.accessToken, 'verify_admin_aal2_session'), 'mfa_required')

const deletedAdmin = await createUser('deleted-admin')
insertAdmin(deletedAdmin.id)
await elevateToAal2(deletedAdmin)
qaSql(`update auth.users set deleted_at=clock_timestamp() where id='${deletedAdmin.id}'::uuid;`)
expectRpcError('deleted-user-session-denied', await callRpc(deletedAdmin.accessToken, 'verify_admin_aal2_session'), 'mfa_required')

const forgedUser = await createUser('forged-user', { role: 'super_admin', access_role: 'super_admin' })
expectRpcOk('forged-metadata-routing-is-user', await callRpc(forgedUser.accessToken, 'get_server_access_context'), value => value?.[0]?.access_role === 'user')
expectRpcError('forged-metadata-admin-rpc-denied', await callRpc(forgedUser.accessToken, 'verify_admin_aal2_session'), 'admin_required')

const partner = await createUser('partner')
const ownVenueId = randomUUID()
const otherVenueId = randomUUID()
qaSql(`
  insert into public.venues(id,name,category,address,latitude,longitude) values
    ('${ownVenueId}'::uuid,'QA own venue','other','isolated local QA',35.0,129.0),
    ('${otherVenueId}'::uuid,'QA other venue','other','isolated local QA',35.0,129.0);
  insert into public.venue_partner_memberships(user_id,venue_id,role,granted_by)
    values('${partner.id}'::uuid,'${ownVenueId}'::uuid,'owner','${partner.id}'::uuid);
`)
expectRpcOk('partner-effective-role-unaffected', await callRpc(partner.accessToken, 'get_access_context'), value => value?.[0]?.access_role === 'partner' && value[0].partner_venue_ids?.length === 1 && value[0].partner_venue_ids[0] === ownVenueId)
expectRpcOk('partner-own-venue-allowed', await callRpc(partner.accessToken, 'is_venue_partner', { p_venue_id: ownVenueId, p_user_id: partner.id }), value => value === true)
expectRpcOk('partner-other-venue-denied', await callRpc(partner.accessToken, 'is_venue_partner', { p_venue_id: otherVenueId, p_user_id: partner.id }), value => value === false)

const ordinary = await createUser('ordinary')
expectRpcOk('ordinary-user-effective-role-unaffected', await callRpc(ordinary.accessToken, 'get_access_context'), value => value?.[0]?.access_role === 'user' && value[0].partner_venue_ids?.length === 0)

const report = {
  verifiedAt: new Date().toISOString(),
  target: QA.projectId,
  api: QA.apiUrl,
  isolated: true,
  testCount: results.length,
  passed: results.every(result => result.passed),
  tests: results,
  secretsLogged: false,
}
const artifactDirectory = join(QA.workspaceRoot, 'artifacts/option2-live-20260908')
mkdirSync(artifactDirectory, { recursive: true })
writeFileSync(join(artifactDirectory, `security-live-results-${suffix}.json`), JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify(report))
