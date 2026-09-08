import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

// Embedded PostgreSQL executes the real latest function definitions. This is
// not proof of a remote Supabase migration, PostgREST, or multi-worker locking.
const IDS = {
  application: '10000000-0000-4000-8000-000000000001',
  arrivalRound: '20000000-0000-4000-8000-000000000001',
  arrivalTeam: '30000000-0000-4000-8000-000000000001',
  caller: '40000000-0000-4000-8000-000000000001',
  deposit: '50000000-0000-4000-8000-000000000001',
  financialTeam: '60000000-0000-4000-8000-000000000001',
  lease: '70000000-0000-4000-8000-000000000001',
}

const migrationsDirectory = path.join(process.cwd(), 'supabase', 'migrations')

function extractFunction(source, functionName, filename) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}(`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `missing ${functionName} definition in ${filename}`)

  const tail = source.slice(start)
  const end = /\r?\n\$\$;/.exec(tail)
  assert.ok(end, `unterminated ${functionName} definition in ${filename}`)
  return tail.slice(0, end.index + end[0].length)
}

async function readLatestFunction(functionName) {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort()

  let latest = null
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}(`

  for (const filename of filenames) {
    const source = await readFile(path.join(migrationsDirectory, filename), 'utf8')
    let searchFrom = 0

    while (true) {
      const start = source.indexOf(marker, searchFrom)
      if (start === -1) break

      latest = {
        filename,
        sql: extractFunction(source.slice(start), functionName, filename),
      }
      searchFrom = start + marker.length
    }
  }

  assert.ok(latest, `missing ${functionName} definition`)
  return latest
}

async function createFixture() {
  const db = new PGlite()

  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE SCHEMA quantum_private;

    CREATE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::UUID
    $$;

    CREATE FUNCTION auth.role()
    RETURNS TEXT
    LANGUAGE sql
    STABLE
    AS $$
      SELECT COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
        'anon'
      )
    $$;

    CREATE FUNCTION quantum_private.write_tonight_audit(
      TEXT,
      UUID,
      TEXT,
      JSONB,
      JSONB,
      TEXT
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NULL;
    END;
    $$;

    CREATE TABLE public.users (
      id UUID PRIMARY KEY
    );

    CREATE TABLE public.tonight_rounds (
      id UUID PRIMARY KEY,
      reveal_at TIMESTAMPTZ NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE public.tonight_teams (
      id UUID PRIMARY KEY,
      round_id UUID,
      team_code TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE public.tonight_team_members (
      team_id UUID NOT NULL,
      application_id UUID NOT NULL,
      user_id UUID,
      seat_number SMALLINT NOT NULL,
      member_status TEXT NOT NULL DEFAULT 'assigned',
      PRIMARY KEY (team_id, application_id)
    );

    CREATE TABLE public.tonight_attendance (
      team_id UUID NOT NULL,
      application_id UUID NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL,
      PRIMARY KEY (team_id, application_id)
    );

    CREATE TABLE public.tonight_deposits (
      id UUID PRIMARY KEY,
      application_id UUID NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL
    );

    CREATE TABLE public.tonight_partner_service_confirmations (
      team_id UUID PRIMARY KEY,
      confirmed_attendee_count SMALLINT NOT NULL,
      service_completed_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE public.tonight_settlements (
      team_id UUID PRIMARY KEY
    );

    CREATE TABLE quantum_private.tonight_deposit_terminal_events (
      deposit_id UUID NOT NULL,
      attendance_revision INTEGER NOT NULL,
      PRIMARY KEY (deposit_id, attendance_revision)
    );

    CREATE TABLE quantum_private.tonight_deposit_disposition_jobs (
      id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
      deposit_id UUID NOT NULL,
      attendance_revision INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      lease_id UUID,
      lease_expires_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error_code TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (deposit_id, attendance_revision)
    );

    CREATE TABLE quantum_private.tonight_settlement_jobs (
      id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
      team_id UUID NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      lease_id UUID,
      lease_expires_at TIMESTAMPTZ,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error_code TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.tonight_arrival_help_requests (
      id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
      team_id UUID NOT NULL,
      requested_by UUID NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      handled_by UUID,
      revision INTEGER NOT NULL DEFAULT 0,
      request_idempotency_key TEXT NOT NULL,
      last_action_idempotency_key TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (requested_by, request_idempotency_key),
      UNIQUE (last_action_idempotency_key),
      UNIQUE (id, team_id)
    );

    CREATE UNIQUE INDEX tonight_arrival_help_one_active_per_member
      ON public.tonight_arrival_help_requests (team_id, requested_by)
      WHERE status IN ('requested', 'acknowledged', 'escalated');

    INSERT INTO public.users (id) VALUES ('${IDS.caller}');
    INSERT INTO public.tonight_rounds (id, reveal_at, starts_at)
    VALUES (
      '${IDS.arrivalRound}',
      CURRENT_TIMESTAMP - INTERVAL '1 hour',
      CURRENT_TIMESTAMP + INTERVAL '1 hour'
    );
    INSERT INTO public.tonight_teams (id, round_id, team_code, status)
    VALUES
      ('${IDS.arrivalTeam}', '${IDS.arrivalRound}', 'ARRIVAL-1', 'revealed'),
      ('${IDS.financialTeam}', NULL, 'FINANCE-1', 'completed');
    INSERT INTO public.tonight_team_members (
      team_id,
      application_id,
      user_id,
      seat_number
    )
    VALUES
      (
        '${IDS.arrivalTeam}',
        '10000000-0000-4000-8000-000000000002',
        '${IDS.caller}',
        1
      ),
      ('${IDS.financialTeam}', '${IDS.application}', NULL, 1);
    INSERT INTO public.tonight_attendance (
      team_id,
      application_id,
      status,
      revision
    )
    VALUES ('${IDS.financialTeam}', '${IDS.application}', 'arrived', 0);
    INSERT INTO public.tonight_deposits (id, application_id, status, revision)
    VALUES ('${IDS.deposit}', '${IDS.application}', 'paid', 0);
    INSERT INTO public.tonight_partner_service_confirmations (
      team_id,
      confirmed_attendee_count,
      service_completed_at
    )
    VALUES ('${IDS.financialTeam}', 1, CURRENT_TIMESTAMP);
  `)

  return db
}

async function installFunction(db, functionName) {
  const definition = await readLatestFunction(functionName)
  await db.exec(definition.sql)
  return definition
}

async function setClaims(db, { role = 'authenticated', sub = IDS.caller } = {}) {
  await db.query(
    `SELECT
       pg_catalog.set_config('request.jwt.claim.role', $1, false),
       pg_catalog.set_config('request.jwt.claim.sub', $2, false)`,
    [role, sub],
  )
}

test('forward migration upgrades existing functions and preserves exact execute ACLs', async () => {
  const db = await createFixture()
  try {
    const financialSource = await readFile(
      path.join(
        migrationsDirectory,
        '20260903012300_tonight_financial_worker_claims.sql',
      ),
      'utf8',
    )
    const arrivalSource = await readFile(
      path.join(migrationsDirectory, '20260903103000_tonight_arrival_help.sql'),
      'utf8',
    )

    await db.exec(
      extractFunction(
        financialSource,
        'service_claim_tonight_deposit_dispositions',
        '20260903012300_tonight_financial_worker_claims.sql',
      ),
    )
    await db.exec(
      extractFunction(
        financialSource,
        'service_claim_tonight_settlements',
        '20260903012300_tonight_financial_worker_claims.sql',
      ),
    )
    await db.exec(
      extractFunction(
        arrivalSource,
        'request_my_tonight_arrival_help',
        '20260903103000_tonight_arrival_help.sql',
      ),
    )

    const definitions = await Promise.all([
      readLatestFunction('service_claim_tonight_deposit_dispositions'),
      readLatestFunction('service_claim_tonight_settlements'),
      readLatestFunction('request_my_tonight_arrival_help'),
    ])
    assert.equal(new Set(definitions.map(({ filename }) => filename)).size, 1)
    const repairSource = await readFile(
      path.join(migrationsDirectory, definitions[0].filename),
      'utf8',
    )

    await db.exec(repairSource)

    const privileges = await db.query(`
      WITH expected(function_name, function_oid) AS (
        VALUES
          (
            'deposit',
            'public.service_claim_tonight_deposit_dispositions(uuid,integer,integer)'::REGPROCEDURE
          ),
          (
            'settlement',
            'public.service_claim_tonight_settlements(uuid,integer,integer)'::REGPROCEDURE
          ),
          (
            'arrival',
            'public.request_my_tonight_arrival_help(uuid,text,text)'::REGPROCEDURE
          )
      )
      SELECT
        expected.function_name,
        EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
          ) AS privilege
          WHERE privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
        ) AS public_execute,
        pg_catalog.has_function_privilege('anon', expected.function_oid, 'EXECUTE')
          AS anon_execute,
        pg_catalog.has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
          AS authenticated_execute,
        pg_catalog.has_function_privilege('service_role', expected.function_oid, 'EXECUTE')
          AS service_execute
      FROM expected
      JOIN pg_catalog.pg_proc AS proc ON proc.oid = expected.function_oid
      ORDER BY expected.function_name
    `)

    assert.deepEqual(privileges.rows, [
      {
        function_name: 'arrival',
        public_execute: false,
        anon_execute: false,
        authenticated_execute: true,
        service_execute: false,
      },
      {
        function_name: 'deposit',
        public_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        service_execute: true,
      },
      {
        function_name: 'settlement',
        public_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        service_execute: true,
      },
    ])
  } finally {
    await db.close()
  }
})

test('deposit-disposition claim executes and duplicate polling does not duplicate its job', async () => {
  const db = await createFixture()
  try {
    await installFunction(db, 'service_claim_tonight_deposit_dispositions')
    await setClaims(db, { role: 'service_role' })

    const first = await db.query(
      'SELECT * FROM public.service_claim_tonight_deposit_dispositions($1, 100, 120)',
      [IDS.lease],
    )
    const second = await db.query(
      'SELECT * FROM public.service_claim_tonight_deposit_dispositions($1, 100, 120)',
      [IDS.lease],
    )
    const jobs = await db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM quantum_private.tonight_deposit_disposition_jobs',
    )

    assert.equal(first.rows.length, 1)
    assert.equal(first.rows[0].deposit_id, IDS.deposit)
    assert.equal(second.rows.length, 0)
    assert.equal(jobs.rows[0].count, 1)
  } finally {
    await db.close()
  }
})

test('settlement claim executes and duplicate polling does not duplicate its job', async () => {
  const db = await createFixture()
  try {
    await installFunction(db, 'service_claim_tonight_settlements')
    await setClaims(db, { role: 'service_role' })

    const first = await db.query(
      'SELECT * FROM public.service_claim_tonight_settlements($1, 100, 120)',
      [IDS.lease],
    )
    const second = await db.query(
      'SELECT * FROM public.service_claim_tonight_settlements($1, 100, 120)',
      [IDS.lease],
    )
    const jobs = await db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM quantum_private.tonight_settlement_jobs',
    )

    assert.equal(first.rows.length, 1)
    assert.equal(first.rows[0].team_id, IDS.financialTeam)
    assert.equal(second.rows.length, 0)
    assert.equal(jobs.rows[0].count, 1)
  } finally {
    await db.close()
  }
})

test('arrival-help request reuses its idempotency result and active partial index', async () => {
  const db = await createFixture()
  try {
    await installFunction(db, 'request_my_tonight_arrival_help')
    await setClaims(db)

    const first = await db.query(
      `SELECT * FROM public.request_my_tonight_arrival_help(
        $1,
        'entrance',
        'arrival-request-0001'
      )`,
      [IDS.arrivalTeam],
    )
    const duplicate = await db.query(
      `SELECT * FROM public.request_my_tonight_arrival_help(
        $1,
        'entrance',
        'arrival-request-0001'
      )`,
      [IDS.arrivalTeam],
    )

    await assert.rejects(
      db.query(
        `SELECT * FROM public.request_my_tonight_arrival_help(
          $1,
          'entrance',
          'arrival-request-0002'
        )`,
        [IDS.arrivalTeam],
      ),
      /arrival_help_already_active/,
    )

    const requests = await db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM public.tonight_arrival_help_requests',
    )
    assert.equal(first.rows.length, 1)
    assert.equal(duplicate.rows[0].request_id, first.rows[0].request_id)
    assert.equal(requests.rows[0].count, 1)
  } finally {
    await db.close()
  }
})

test('financial claim functions reject non-service callers before queue writes', async () => {
  const db = await createFixture()
  try {
    await installFunction(db, 'service_claim_tonight_deposit_dispositions')
    await installFunction(db, 'service_claim_tonight_settlements')
    await setClaims(db)

    for (const functionName of [
      'service_claim_tonight_deposit_dispositions',
      'service_claim_tonight_settlements',
    ]) {
      await assert.rejects(
        db.query(`SELECT * FROM public.${functionName}($1, 100, 120)`, [IDS.lease]),
        /service_role_required/,
      )
    }

    const jobs = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM quantum_private.tonight_deposit_disposition_jobs)::INTEGER
          AS deposit_count,
        (SELECT COUNT(*) FROM quantum_private.tonight_settlement_jobs)::INTEGER
          AS settlement_count
    `)
    assert.deepEqual(jobs.rows[0], { deposit_count: 0, settlement_count: 0 })
  } finally {
    await db.close()
  }
})

test('arrival-help request rejects an unauthenticated caller before writing', async () => {
  const db = await createFixture()
  try {
    await installFunction(db, 'request_my_tonight_arrival_help')
    await setClaims(db, { sub: '' })

    await assert.rejects(
      db.query(
        `SELECT * FROM public.request_my_tonight_arrival_help(
          $1,
          'entrance',
          'arrival-request-0001'
        )`,
        [IDS.arrivalTeam],
      ),
      /not_authenticated/,
    )

    const requests = await db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM public.tonight_arrival_help_requests',
    )
    assert.equal(requests.rows[0].count, 0)
  } finally {
    await db.close()
  }
})
