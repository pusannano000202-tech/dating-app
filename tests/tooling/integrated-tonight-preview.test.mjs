import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateTarget,fixtureInputs,buildFixtureSql,buildIdentityRepairSql,buildReadinessFixtureSql } from '../../scripts/qa/seed-integrated-tonight-preview.mjs'

test('only exact local Docker project and port accepted',()=>{
 const labels={'com.supabase.cli.project':'quantum-integrated-campus-20260905'}
 assert.doesNotThrow(()=>validateTarget('npipe:////./pipe/dockerDesktopLinuxEngine',labels,'56422'))
 for(const [endpoint,project,port] of [
  ['tcp://remote:2375',labels,'56422'],
  ['npipe:////./pipe/dockerDesktopLinuxEngine',{},'56422'],
  ['npipe:////./pipe/dockerDesktopLinuxEngine',labels,'56322'],
 ]) assert.throws(()=>validateTarget(endpoint,project,port),/unexpected_local_database/)
})
test('preview uses existing daily catalog and defaults to rollback',async()=>{
 const inputs=await fixtureInputs('2026-09-20')
 assert.equal(inputs.activities.length,3)
 for(const a of inputs.activities) assert.ok((await readFile(new URL('../../public'+a.imageUrl,import.meta.url))).length>0)
 const sql=buildFixtureSql(inputs)
 assert.ok(sql.endsWith('ROLLBACK;'))
 assert.ok(buildFixtureSql(inputs,true).endsWith('COMMIT;'))
 assert.match(sql,/qa_identity_exists_no_overwrite/)
 assert.match(sql,/round_exists_no_overwrite/)
 assert.match(sql,/existing_data_changed/)
 assert.match(sql,/qa_today_signup_window_required/)
 assert.match(sql,/INSERT INTO auth\.identities/)
 assert.match(sql,/instance_id/)
 assert.match(sql,/confirmation_token/)
 assert.doesNotMatch(sql,/DELETE FROM|DROP TABLE|ALTER TABLE|TRUNCATE|DISABLE TRIGGER/i)
 assert.doesNotMatch(sql,/INSERT INTO public\.tonight_deposits|INSERT INTO public\.tonight_applications/i)
})
test('identity repair only attaches the exact ordinary QA email identity',()=>{
 const sql=buildIdentityRepairSql()
 assert.ok(sql.endsWith('ROLLBACK;'))
 assert.match(sql,/qa_identity_owner_mismatch/)
 assert.match(sql,/raw_user_meta_data->>'local_fixture'/)
 assert.match(sql,/role='authenticated'/)
 assert.match(sql,/INSERT INTO auth\.identities/)
 assert.match(sql,/UPDATE auth\.users[\s\S]*WHERE id='e9200000-0000-4000-8000-000000000001'::uuid/)
 assert.match(sql,/identity_data->>'email'=[^\n]+\) IS NOT TRUE/)
 assert.doesNotMatch(sql,/\bDELETE\b|TRUNCATE|\bGRANT\b|DISABLE TRIGGER/i)
 assert.ok(buildIdentityRepairSql(true).endsWith('COMMIT;'))
})
test('local Tonight intake requires explicit opt-in; real payments stay off',async()=>{
 const launcher=await readFile(new URL('../../scripts/qa/serve-social-scenes-local.mjs',import.meta.url),'utf8')
 assert.match(launcher,/--tonight-qa/)
 assert.match(launcher,/TONIGHT_APPLICATIONS_OPEN: tonightQa \? 'true' : 'false'/)
 assert.match(launcher,/TONIGHT_CARD_PAYMENTS_ENABLED: 'false'/)
 assert.match(launcher,/TONIGHT_AUTOMATION_ENABLED: 'false'/)
})
test('readiness fixture is synthetic, exact-owner scoped and rollback first',()=>{
 const sql=buildReadinessFixtureSql()
 assert.ok(sql.endsWith('ROLLBACK;'))
 assert.match(sql,/qa_readiness_target_mismatch/)
 assert.match(sql,/qa_readiness_already_exists/)
 assert.match(sql,/raw_user_meta_data->>'local_fixture'/)
 assert.match(sql,/matching_ready FROM quantum_private\.resolve_profile_readiness/)
 assert.doesNotMatch(sql,/DISABLE TRIGGER|ALTER FUNCTION|INSERT INTO public\.tonight_(applications|deposits)/i)
})
