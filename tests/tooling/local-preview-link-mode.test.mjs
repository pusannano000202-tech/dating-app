import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {integratedUiEnvironment} from '../../scripts/qa/integrated-ui-config.mjs'

test('preview link availability follows the launcher mode, not an inherited flag',()=>{
 const offline=integratedUiEnvironment({NEXT_PUBLIC_QUANTUM_LOCAL_RUNTIME_MODE:'live-local'},'--offline-ui')
 assert.equal(offline.NEXT_PUBLIC_QUANTUM_LOCAL_RUNTIME_MODE,'offline-ui')
 const live=integratedUiEnvironment({NEXT_PUBLIC_QUANTUM_LOCAL_RUNTIME_MODE:'offline-ui',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:56421',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-test',SUPABASE_SERVICE_ROLE_KEY:'local-test',PHONE_VERIFICATION_DIGEST_SECRET:'local-test',PROFILE_ALIAS_SIGNING_SECRET:'local-test',SUPABASE_PHONE_OTP_TTL_SECONDS:'60'},'--live-local')
 assert.equal(live.NEXT_PUBLIC_QUANTUM_LOCAL_RUNTIME_MODE,'live-local')
})

test('league, study and mentoring only advertise the offline-only candidate rehearsal in offline UI',()=>{
 for(const path of ['components/community/department/DepartmentLeagueJourney.tsx','components/meetups/HostedStudyLobby.tsx','components/meetups/HostedMentoringLobby.tsx']){
  const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8')
  assert.match(source,/process\.env\.NODE_ENV==='development'&&process\.env\.NEXT_PUBLIC_QUANTUM_LOCAL_RUNTIME_MODE==='offline-ui'\?<Link[^>]+dev-candidates/,path)
 }
 const page=readFileSync(new URL('../../app/meetups/dev-candidates/page.tsx',import.meta.url),'utf8')
 assert.match(page,/process\.env\.NODE_ENV!=='development'\|\|process\.env\.QUANTUM_LOCAL_RUNTIME_MODE!=='offline-ui'/)
})
