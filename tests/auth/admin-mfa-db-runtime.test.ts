import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const USER_ID = '20000000-0000-4000-8000-000000000001'
const SESSION_ID = '30000000-0000-4000-8000-000000000001'

function migration(): string {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const [name] = readdirSync(dir).filter((entry) =>
    /^\d{14}_admin_mfa_privacy_boundary\.sql$/.test(entry),
  )
  assert.ok(name)
  return readFileSync(join(dir, name), 'utf8')
}

function functionDdl(sql: string, qualifiedName: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${qualifiedName.replace('.', '\\.')}\\b`, 'i'))
  assert.notEqual(start, -1, `${qualifiedName} is missing`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

async function setClaims(db: PGlite, claims: Record<string, unknown>) {
  await db.query("SELECT pg_catalog.set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
}

async function isAdmin(db: PGlite): Promise<boolean> {
  const result = await db.query<{ allowed: boolean }>('SELECT public.is_admin($1::UUID) AS allowed', [USER_ID])
  return result.rows[0]?.allowed === true
}

async function contextRole(
  db: PGlite,
  functionName: 'get_access_context' | 'get_server_access_context',
): Promise<string | null> {
  const result = await db.query<{ access_role: string }>(`SELECT access_role FROM public.${functionName}()`)
  return result.rows[0]?.access_role ?? null
}

test('database helper denies AAL1, malformed, expired, forged, missing-session and revoked-role requests', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE SCHEMA quantum_private;
      CREATE TABLE auth.users (
        id UUID PRIMARY KEY,
        deleted_at TIMESTAMPTZ,
        banned_until TIMESTAMPTZ
      );
      CREATE TABLE auth.sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        not_after TIMESTAMPTZ
      );
      CREATE TABLE public.admins (user_id UUID PRIMARY KEY, role TEXT NOT NULL);
      CREATE TABLE public.venue_partner_memberships (user_id UUID NOT NULL, venue_id UUID NOT NULL, revoked_at TIMESTAMPTZ);
      CREATE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', TRUE), ''), '{}')::JSONB
      $$;
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(auth.jwt() ->> 'sub', '')::UUID
      $$;
      CREATE FUNCTION quantum_private.account_deletion_blocks_access(UUID) RETURNS BOOLEAN
      LANGUAGE sql STABLE AS $$ SELECT FALSE $$;
    `)

    const sql = migration()
    await db.exec(functionDdl(sql, 'quantum_private.admin_session_has_aal2'))
    await db.exec(functionDdl(sql, 'public.is_admin'))
    await db.exec(functionDdl(sql, 'public.is_super_admin'))
    await db.exec(functionDdl(sql, 'public.verify_admin_aal2_session'))
    await db.exec(functionDdl(sql, 'public.get_server_access_context'))
    await db.exec(functionDdl(sql, 'public.get_access_context'))
    await db.query('INSERT INTO auth.users (id) VALUES ($1)', [USER_ID])
    await db.query('INSERT INTO public.admins (user_id, role) VALUES ($1, $2)', [USER_ID, 'admin'])
    await db.query('INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)', [SESSION_ID, USER_ID])

    const futureExp = Math.floor(Date.now() / 1000) + 3600
    await setClaims(db, { sub: USER_ID, aal: 'aal1', session_id: SESSION_ID, exp: futureExp })
    assert.equal(await isAdmin(db), false)
    assert.equal(await contextRole(db, 'get_access_context'), 'user')
    assert.equal(await contextRole(db, 'get_server_access_context'), 'admin')

    await setClaims(db, { sub: USER_ID, aal: 'aal2', session_id: SESSION_ID, exp: futureExp })
    assert.equal(await isAdmin(db), true)
    assert.equal(await contextRole(db, 'get_access_context'), 'admin')

    await db.query("UPDATE auth.sessions SET not_after = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = $1", [SESSION_ID])
    assert.equal(await isAdmin(db), false)
    await db.query('UPDATE auth.sessions SET not_after = NULL WHERE id = $1', [SESSION_ID])

    await db.query("UPDATE auth.users SET banned_until = CURRENT_TIMESTAMP + INTERVAL '1 hour' WHERE id = $1", [USER_ID])
    assert.equal(await isAdmin(db), false)
    await db.query('UPDATE auth.users SET banned_until = NULL WHERE id = $1', [USER_ID])

    await db.query('UPDATE auth.users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [USER_ID])
    assert.equal(await isAdmin(db), false)
    await db.query('UPDATE auth.users SET deleted_at = NULL WHERE id = $1', [USER_ID])

    await setClaims(db, { sub: USER_ID, aal: 'aal2', session_id: 'forged', exp: futureExp })
    assert.equal(await isAdmin(db), false)

    await setClaims(db, { sub: USER_ID, aal: 'aal2', session_id: '30000000-0000-4000-8000-000000000099', exp: futureExp })
    assert.equal(await isAdmin(db), false)

    await setClaims(db, { sub: USER_ID, aal: 'aal2', session_id: SESSION_ID, exp: 1 })
    assert.equal(await isAdmin(db), false)

    await setClaims(db, {
      sub: '20000000-0000-4000-8000-000000000099',
      aal: 'aal2',
      session_id: SESSION_ID,
      exp: futureExp,
    })
    assert.equal(await isAdmin(db), false)

    await setClaims(db, { sub: USER_ID, aal: 'aal2', session_id: SESSION_ID, exp: futureExp })
    await db.query('DELETE FROM public.admins WHERE user_id = $1', [USER_ID])
    assert.equal(await isAdmin(db), false)
    assert.equal(await contextRole(db, 'get_access_context'), 'user')
    assert.equal(await contextRole(db, 'get_server_access_context'), 'user')

    await db.query(
      'INSERT INTO public.venue_partner_memberships (user_id, venue_id) VALUES ($1, $2)',
      [USER_ID, '40000000-0000-4000-8000-000000000001'],
    )
    assert.equal(await contextRole(db, 'get_access_context'), 'partner')
    assert.equal(await contextRole(db, 'get_server_access_context'), 'partner')
  } finally {
    await db.close()
  }
})
