import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { classifyStudyRoomError, parseStudyRoomDetail, parseStudyRoomHistory, parseStudyRoomList, validateStudyRoomAction } from '../../lib/meetups/study-room-contract.ts'
import { ADDITIONAL_STUDY_COURSE_ROWS, ADDITIONAL_STUDY_CURRICULA } from '../../lib/meetups/study-course-data.ts'

const migration = new URL('../../supabase/migrations/20260909150749_meetup_recurring_study_rooms.sql', import.meta.url)
const catalogMigration = new URL('../../supabase/migrations/20260910040451_meetup_verified_pnu_courses.sql', import.meta.url)
const expandedCatalogMigration = new URL('../../supabase/migrations/20260911160330_meetup_official_pnu_curriculum_expansion.sql', import.meta.url)
const ids = Array.from({length: 10}, (_, i) => `10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create table public.users(id uuid primary key);
    create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
    alter table public.users add foreign key(id) references auth.users(id) on delete cascade;
    create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function quantum_private.account_deletion_blocks_access(uuid) returns boolean language sql stable as $$ select false $$;
    create function quantum_private.resolve_profile_readiness(uuid) returns table(minimum_signup_complete boolean) language sql stable as $$ select true $$;
    create function quantum_private.get_or_create_daily_identity(uuid,timestamptz) returns jsonb language sql as $$ select jsonb_build_object('display_name','별친구','character_key','star','pool_version','test','tier','C') $$;
    create function quantum_private.tonight_invite_pair_is_blocked(uuid,uuid) returns boolean language sql stable as $$ select false $$;
  `)
  const identitySource = await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql',import.meta.url),'utf8')
  for (const name of ['canonical_department_key','canonical_school_scope_key','get_member_department_identity']) {
    const start = identitySource.indexOf(`create or replace function quantum_private.${name}(`)
    const tail = identitySource.slice(start); const end = tail.indexOf('$$;')
    await db.exec(tail.slice(0,end+3))
  }
  const accessSource = await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',import.meta.url),'utf8')
  const start = accessSource.indexOf('create function quantum_private.assert_activity_room_access(')
  const tail = accessSource.slice(start)
  await db.exec(tail.slice(0,tail.indexOf('$$;')+3))
  for (let i=0;i<ids.length;i++) {
    await db.query('insert into auth.users(id) values($1)',[ids[i]])
    await db.query('insert into public.users values($1)',[ids[i]])
    await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',[ids[i],'pnu_self_selected',i===9?'다른학과':'미래에너지공학과',i%2?'female':'male'])
  }
  await db.exec(await readFile(migration,'utf8'))
  await db.exec(await readFile(catalogMigration,'utf8'))
  const originalCatalog = (await db.query('select * from quantum_private.study_course_catalog order by course_id')).rows
  await db.exec(await readFile(expandedCatalogMigration,'utf8'))
  async function act(user,action,args={}) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??''])
    await db.exec('set role authenticated')
    try { return (await db.query('select public.study_room_action($1,$2::jsonb) as value',[action,JSON.stringify(args)])).rows[0].value }
    finally { await db.exec('reset role') }
  }
  return {db,act,originalCatalog}
}

test('verified PNU additions match the frontend, are replay-safe and create canonical rooms without bypassing access', async () => {
  const { db, act, originalCatalog } = await fixture()
  try {
    const rows = (await db.query('select * from quantum_private.study_course_catalog order by course_id')).rows
    assert.equal(originalCatalog.length, 47)
    assert.equal(rows.length, 169)
    assert.equal(new Set(rows.map(row => row.course_id)).size, rows.length)
    for (const original of originalCatalog) assert.deepEqual(rows.find(row => row.course_id === original.course_id), original)
    const uniqueAdditionalRows = [...new Map(ADDITIONAL_STUDY_COURSE_ROWS.map(row => [row[1], row])).values()]
    for (const [curriculumId, code, title] of uniqueAdditionalRows) {
      const source = ADDITIONAL_STUDY_CURRICULA.find(item => item.id === curriculumId)
      assert.deepEqual(rows.find(item => item.course_id === `pnu:${code}`), { course_id: `pnu:${code}`, course_name: title, source_url: source.url })
      const room = await act(ids[0], 'create', { course_id: `pnu:${code}`, course_name: '클라이언트가 꾸민 이름', level: 'beginner' })
      assert.equal(room.course_name, title)
      assert.ok(parseStudyRoomDetail(room))
      await assert.rejects(act(ids[9], 'join', { room_id: room.id }), /forbidden/)
    }
    await db.exec(await readFile(catalogMigration, 'utf8'))
    await db.exec(await readFile(expandedCatalogMigration, 'utf8'))
    assert.deepEqual((await db.query('select * from quantum_private.study_course_catalog order by course_id')).rows, rows)
    await assert.rejects(act(null, 'list', { course_id: 'pnu:DB1600346', level: 'beginner' }), /not_authenticated/)
    await db.exec('set role authenticated')
    await assert.rejects(db.query("insert into quantum_private.study_course_catalog values ('pnu:FAKE', 'fake', 'https://fake.invalid')"), /permission denied/)
    await db.exec('reset role')
    const sql = await readFile(expandedCatalogMigration, 'utf8')
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(?:alter|create|drop|update|delete|grant|revoke|truncate)\b/i, 'catalog expansion is insert-only, with no RPC, RLS or permissions change')
    assert.match(sql, /on conflict \(course_id\) do nothing/i)
  } finally { await db.close() }
})

test('persistent study lifecycle: refill, immutable appointment, skip, history and private exit',async()=>{
  const {db,act}=await fixture()
  try {
    const course={course_id:'pnu:AN1500385',level:'beginner'}
    const room=await act(ids[0],'create',course)
    assert.ok(parseStudyRoomDetail(room), 'real SQL detail satisfies frontend parser')
    assert.equal(room.recommended_sessions,10)
    assert.equal(room.member_count,1)
    assert.equal(room.course_name,'공학수학')
    for(let i=1;i<5;i++) await act(ids[i],'join',{room_id:room.id})
    const second=await act(ids[5],'create',course)
    await act(ids[6],'join',{room_id:second.id})
    assert.notEqual(room.id,second.id)
    await act(ids[0],'message',{room_id:room.id,message:'도서관에서 만나기로 했어요.',idempotency_key:'20000000-0000-4000-8000-000000000001'})
    for(let i=0;i<5;i++) await act(ids[i],'attendance',{room_id:room.id,session_number:1,attending:true})
    const proposed=await act(ids[0],'propose_schedule',{room_id:room.id,session_number:1,starts_at:new Date(Date.now()+3600000).toISOString(),place_name:'교내 도서관',place_note:'예약은 별도',is_sponsored:false})
    const proposal=proposed.sessions[0].proposals[0].id
    for(let i=0;i<5;i++) await act(ids[i],'vote_schedule',{room_id:room.id,session_number:1,proposal_id:proposal})
    for(let i=0;i<5;i++) {
      await act(ids[i],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id:proposal})
    }
    assert.equal((await act(ids[0],'detail',{room_id:room.id})).sessions[0].status,'confirmed')
    const leaving=await act(ids[4],'leave',{room_id:room.id,report_reason:'불편한 연락을 강요했어요.'})
    assert.deepEqual(leaving,{left:true,report_status:'saved'})
    const lobby=await act(ids[7],'list',course)
    assert.ok(parseStudyRoomList(lobby))
    assert.deepEqual(lobby.rooms.map(r=>r.member_count).sort(),[2,4])
    const joined=await act(ids[7],'join',{room_id:room.id})
    assert.ok(parseStudyRoomDetail(joined))
    assert.equal(joined.messages[0].message,'도서관에서 만나기로 했어요.')
    assert.equal(joined.sessions[0].place_name,'교내 도서관')
    assert.equal(joined.sessions[0].my_attendance,'undecided')
    assert.equal(joined.sessions[0].my_schedule_accepted,false)
    await act(ids[7],'attendance',{room_id:room.id,session_number:1,attending:true})
    await assert.rejects(act(ids[7],'complete_session',{room_id:room.id,session_number:1}),/acceptance_required/)
    await act(ids[7],'accept_schedule',{room_id:room.id,session_number:1})
    await act(ids[7],'attendance',{room_id:room.id,session_number:1,attending:false})
    assert.equal((await act(ids[7],'detail',{room_id:room.id})).member_count,5)
    await assert.rejects(act(ids[4],'detail',{room_id:room.id}),/membership_required/)
    await assert.rejects(act(ids[9],'join',{room_id:room.id}),/forbidden/)
    await assert.rejects(act(null,'list',course),/not_authenticated/)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from quantum_private.study_room_reports'),/permission denied/)
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as n from quantum_private.study_room_reports')).rows[0].n,1)
    await db.exec(`create function quantum_private.fail_study_report() returns trigger language plpgsql as $$ begin raise exception 'simulated report outage'; end $$; create trigger fail_report before insert on quantum_private.study_room_reports for each row execute function quantum_private.fail_study_report();`)
    assert.deepEqual(await act(ids[7],'leave',{room_id:room.id,report_reason:'신고 전송 실패에도 나가기'}),{left:true,report_status:'failed'})
    await assert.rejects(act(ids[7],'detail',{room_id:room.id}),/membership_required/)
  } finally {await db.close()}
})

test('database guards malformed data, idempotency, historical attendance and invalidated confirmations',async()=>{
  const {db,act}=await fixture()
  try {
    await assert.rejects(act(ids[0],'create',{course_id:'pnu:FAKE',level:'beginner'}),/invalid_course_id/)
    const room=await act(ids[0],'create',{course_id:'custom',course_name:'  나만의   과목 ',level:'intermediate'})
    await act(ids[1],'join',{room_id:room.id})
    await assert.rejects(act(ids[0],'attendance',{room_id:room.id,session_number:2,attending:true}),/not_current/)
    for(let i=0;i<2;i++) await act(ids[i],'attendance',{room_id:room.id,session_number:1,attending:true})
    const proposed=await act(ids[0],'propose_schedule',{room_id:room.id,session_number:1,starts_at:new Date(Date.now()+600000).toISOString(),place_name:'교내',place_note:''})
    const proposal=proposed.sessions[0].proposals[0].id
    await act(ids[0],'vote_schedule',{room_id:room.id,session_number:1,proposal_id:proposal})
    await act(ids[0],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id:proposal})
    await act(ids[1],'attendance',{room_id:room.id,session_number:1,attending:false})
    assert.equal((await act(ids[0],'detail',{room_id:room.id})).sessions[0].proposals[0].confirmations,0)
    await act(ids[0],'vote_schedule',{room_id:room.id,session_number:1,proposal_id:proposal})
    await act(ids[0],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id:proposal})
    await db.query('update quantum_private.study_room_sessions set starts_at=now()-interval \'1 hour\' where room_id=$1 and session_number=1',[room.id])
    const done=await act(ids[0],'complete_session',{room_id:room.id,session_number:1})
    assert.equal(done.current_session,2)
    const joined=await act(ids[2],'join',{room_id:room.id})
    assert.equal(joined.sessions[0].my_attendance,'not_member')
    await assert.rejects(act(ids[2],'attendance',{room_id:room.id,session_number:1,attending:true}),/not_current/)
    await assert.rejects(act(ids[2],'recap',{room_id:room.id,session_number:1,text:'가짜 참석'}),/participation_required/)
    const msg={room_id:room.id,message:'안녕하세요',idempotency_key:'30000000-0000-4000-8000-000000000001'}
    await act(ids[0],'message',msg)
    await act(ids[0],'message',msg)
    await assert.rejects(act(ids[0],'message',{...msg,message:'재사용 공격'}),/idempotency_key_reused/)
    assert.equal((await act(ids[0],'detail',{room_id:room.id})).messages.length,1)
    assert.equal(parseStudyRoomDetail({...done,members:[...done.members,{member_id:ids[7],alias:'fake',is_me:false}]}),null)
    assert.equal(parseStudyRoomList({rooms:[{...room,capacity:6}]}),null)
    assert.equal(validateStudyRoomAction({action:'attendance',session_number:1,attending:'true'}),false)
    assert.equal(validateStudyRoomAction({action:'propose_schedule',session_number:1,starts_at:'tomorrow',place_name:'교내'}),false)
    await db.exec('set role anon')
    await assert.rejects(db.query("select public.study_room_action('list','{}')"),/permission denied/)
    await db.exec('reset role')
  } finally {await db.close()}
})

test('read-only listing, capacity contention, immutable old sessions and complete history cursor',async()=>{
  const {db,act}=await fixture()
  try {
    const course={course_id:'pnu:AN1500385',level:'beginner'}
    assert.deepEqual(await act(ids[0],'list',course),{rooms:[]})
    assert.equal((await db.query('select count(*)::int as n from quantum_private.study_room_pools')).rows[0].n,0)
    await assert.rejects(act(ids[9],'create',{course_id:'custom',course_name:' ',level:'beginner'}),/invalid_course_name/)
    assert.equal((await db.query('select count(*)::int as n from quantum_private.study_room_pools')).rows[0].n,0)
    const room=await act(ids[0],'create',course)
    for(let i=1;i<5;i++) await act(ids[i],'join',{room_id:room.id})
    await assert.rejects(act(ids[5],'join',{room_id:room.id}),/full/)
    const lobby=await act(ids[5],'list',course)
    assert.deepEqual(lobby.rooms.map(r=>r.member_count),[5,0])
    assert.deepEqual((await act(ids[0],'mine')).rooms.map(r=>r.id),[room.id])
    const duplicated=await act(ids[0],'create',course)
    assert.equal(duplicated.id,room.id)
    assert.equal((await act(ids[0],'mine')).rooms.length,1)
    await assert.rejects(act(ids[0],'join',{room_id:lobby.rooms[1].id}),/already_joined/)
    await assert.rejects(act(ids[0],'detail',{room_id:'wrong'}),/invalid_room_id/)
    // SQL fixture inserts history directly only to avoid waiting through anti-spam windows.
    await db.query(`insert into quantum_private.study_room_messages(room_id,user_id,sender_alias,message,idempotency_key,created_at)
      select $1,$2,'예전 별명','이전 이야기 '||n,gen_random_uuid(),'2026-01-01T00:00:00Z'::timestamptz+n*interval '0.000001 second' from generate_series(1,125) n`,[room.id,ids[0]])
    const detail=await act(ids[1],'detail',{room_id:room.id})
    assert.equal(detail.messages.length,100)
    assert.equal(detail.has_older_messages,true)
    const first=detail.messages[0]
    const older=await act(ids[1],'history',{room_id:room.id,before_at:first.created_at,before_id:first.id})
    assert.ok(parseStudyRoomHistory(older))
    assert.equal(older.messages.length,25)
    assert.equal(older.has_older_messages,false)
    assert.equal(new Set([...older.messages,...detail.messages].map(m=>m.id)).size,125)
    assert.equal(JSON.stringify(detail).includes(ids[0]),false,'global user id is not exposed')
    assert.equal(JSON.stringify(detail).includes('reporter_id'),false)
    await assert.rejects(act(ids[1],'history',{room_id:room.id,before_at:first.created_at}),/invalid_cursor/)
    await db.query('update quantum_private.community_member_profiles set department=null where user_id=$1',[ids[1]])
    await assert.rejects(act(ids[1],'detail',{room_id:room.id}),/department_identity_required/)
    assert.equal((await act(ids[1],'leave',{room_id:room.id})).left,true,'profile change does not trap exit')
    await db.query('update auth.users set banned_until=now()+interval \'1 day\' where id=$1',[ids[2]])
    await assert.rejects(act(ids[2],'list',course),/forbidden/)
  } finally {await db.close()}
})

test('last unconfirmed participant leaving or skipping releases completed session without inventing attendance',async()=>{
  const {db,act}=await fixture()
  try {
    for(const release of ['leave','skip']) {
      const room=await act(ids[0],'create',{course_id:'custom',course_name:`완료 회귀 ${release}`,level:'beginner'})
      await act(ids[1],'join',{room_id:room.id})
      for(let i=0;i<2;i++) await act(ids[i],'attendance',{room_id:room.id,session_number:1,attending:true})
      const proposed=await act(ids[0],'propose_schedule',{room_id:room.id,session_number:1,starts_at:new Date(Date.now()+600000).toISOString(),place_name:'교내'})
      const proposal_id=proposed.sessions[0].proposals[0].id
      for(let i=0;i<2;i++) await act(ids[i],'vote_schedule',{room_id:room.id,session_number:1,proposal_id})
      for(let i=0;i<2;i++) await act(ids[i],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id})
      await db.query('update quantum_private.study_room_sessions set starts_at=now()-interval \'1 hour\' where room_id=$1 and session_number=1',[room.id])
      await act(ids[0],'complete_session',{room_id:room.id,session_number:1})
      if(release==='leave') await act(ids[1],'leave',{room_id:room.id})
      else await act(ids[1],'attendance',{room_id:room.id,session_number:1,attending:false})
      const final=await act(ids[0],'detail',{room_id:room.id})
      assert.equal(final.current_session,2)
      assert.equal(final.sessions[0].status,'completed')
      assert.equal(final.sessions[0].completed_count,1)
      assert.equal(final.sessions[0].place_name,'교내')
    }
  } finally {await db.close()}
})

test('a later block revokes reading and every interaction while still permitting exit',async()=>{
  const {db,act}=await fixture()
  try {
    const room=await act(ids[0],'create',{course_id:'pnu:AN1500385',level:'beginner'})
    await act(ids[1],'join',{room_id:room.id})
    await act(ids[0],'message',{room_id:room.id,message:'차단 이전 대화',idempotency_key:'40000000-0000-4000-8000-000000000001'})
    await db.exec(`create or replace function quantum_private.tonight_invite_pair_is_blocked(uuid,uuid) returns boolean language sql stable as $$ select $1<>$2 $$;`)
    await assert.rejects(act(ids[1],'detail',{room_id:room.id}),/study_room_forbidden/)
    await assert.rejects(act(ids[1],'history',{room_id:room.id}),/study_room_forbidden/)
    await assert.rejects(act(ids[1],'attendance',{room_id:room.id,session_number:1,attending:true}),/study_room_forbidden/)
    assert.equal((await act(ids[1],'leave',{room_id:room.id})).left,true)
  } finally {await db.close()}
})

test('auth denial is not advertised as an outage and provider errors are never echoed',()=>{
  assert.deepEqual(classifyStudyRoomError({message:'activity_room_forbidden'}),{error:'study_room_forbidden',status:403})
  assert.deepEqual(classifyStudyRoomError({message:'department_identity_required'}),{error:'department_identity_required',status:409})
  assert.deepEqual(classifyStudyRoomError({message:'not_authenticated'}),{error:'not_authenticated',status:401})
  assert.deepEqual(classifyStudyRoomError({message:'secret SQL dump SELECT FROM private table'}),{error:'community_unavailable',status:503})
  assert.deepEqual(classifyStudyRoomError({message:'function unavailable',code:'PGRST202'}),{error:'community_schema_unavailable',status:503})
})

test('physical account deletion clears its own study data without deleting other members or confirmed appointment',async()=>{
  const {db,act}=await fixture()
  try {
    const room=await act(ids[0],'create',{course_id:'pnu:AN1500385',level:'beginner'})
    await act(ids[1],'join',{room_id:room.id})
    for(let i=0;i<2;i++) await act(ids[i],'attendance',{room_id:room.id,session_number:1,attending:true})
    const proposed=await act(ids[1],'propose_schedule',{room_id:room.id,session_number:1,starts_at:new Date(Date.now()+600000).toISOString(),place_name:'교내 도서관'})
    const proposal_id=proposed.sessions[0].proposals[0].id
    for(let i=0;i<2;i++) await act(ids[i],'vote_schedule',{room_id:room.id,session_number:1,proposal_id})
    for(let i=0;i<2;i++) await act(ids[i],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id})
    await db.query('update quantum_private.study_room_sessions set starts_at=now()-interval \'1 hour\' where room_id=$1 and session_number=1',[room.id])
    await act(ids[0],'message',{room_id:room.id,message:'남겨둘 다른 사람 기록',idempotency_key:'50000000-0000-4000-8000-000000000001'})
    await act(ids[1],'message',{room_id:room.id,message:'삭제할 내 기록',idempotency_key:'50000000-0000-4000-8000-000000000002'})
    await act(ids[1],'recap',{room_id:room.id,session_number:1,text:'삭제할 개인 학습기록'})
    await act(ids[0],'complete_session',{room_id:room.id,session_number:1})
    await db.query('delete from auth.users where id=$1',[ids[1]])
    const remaining=await act(ids[0],'detail',{room_id:room.id})
    assert.equal(remaining.member_count,1)
    assert.equal(remaining.current_session,2)
    assert.equal(remaining.sessions[0].place_name,'교내 도서관')
    assert.equal(remaining.sessions[0].proposals[0].id,proposal_id)
    assert.equal(remaining.sessions[0].recaps.length,0)
    assert.deepEqual(remaining.messages.map(m=>m.message),['남겨둘 다른 사람 기록'])
    await act(ids[0],'leave',{room_id:room.id,report_reason:'신고 후 계정 삭제'})
    await db.query('delete from auth.users where id=$1',[ids[0]])
    assert.equal((await db.query('select count(*)::int as n from quantum_private.study_room_reports')).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int as n from quantum_private.study_rooms where id=$1',[room.id])).rows[0].n,1)
  } finally {await db.close()}
})

test('an abandoned started program is preserved privately and never inherited by a fresh cohort',async()=>{
  const {db,act}=await fixture()
  try {
    const course={course_id:'pnu:AN1500385',level:'beginner'}
    const room=await act(ids[0],'create',course)
    await act(ids[0],'attendance',{room_id:room.id,session_number:1,attending:true})
    const proposed=await act(ids[0],'propose_schedule',{room_id:room.id,session_number:1,starts_at:new Date(Date.now()+600000).toISOString(),place_name:'지난 팀의 약속'})
    const proposal_id=proposed.sessions[0].proposals[0].id
    await act(ids[0],'vote_schedule',{room_id:room.id,session_number:1,proposal_id})
    await act(ids[0],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id})
    await act(ids[0],'leave',{room_id:room.id})
    const preserved=(await db.query('select * from quantum_private.study_room_sessions where room_id=$1 and session_number=1',[room.id])).rows[0]
    assert.equal(preserved.status,'confirmed','no invented completion')
    assert.equal(preserved.place_name,'지난 팀의 약속')
    assert.deepEqual(await act(ids[1],'list',course),{rooms:[]})
    await assert.rejects(act(ids[1],'join',{room_id:room.id}),/study_room_closed/)
    const fresh=await act(ids[1],'create',course)
    assert.notEqual(fresh.id,room.id)
    assert.equal(fresh.sessions[0].status,'planning')
    assert.equal(fresh.current_session,1)
  } finally {await db.close()}
})

test('expired appointment options do not permanently consume the eight available choices',async()=>{
  const {db,act}=await fixture()
  try {
    const room=await act(ids[0],'create',{course_id:'pnu:AN1500385',level:'beginner'})
    await act(ids[0],'attendance',{room_id:room.id,session_number:1,attending:true})
    const args={room_id:room.id,session_number:1,starts_at:new Date(Date.now()+600000).toISOString(),place_name:'교내'}
    for(let i=0;i<8;i++) await act(ids[0],'propose_schedule',{...args,place_name:`교내 ${i}`})
    await assert.rejects(act(ids[0],'propose_schedule',args),/study_proposal_limit/)
    await db.query("update quantum_private.study_room_proposals set starts_at=now()-interval '1 hour' where room_id=$1",[room.id])
    const refreshed=await act(ids[0],'propose_schedule',args)
    assert.equal(refreshed.sessions[0].proposals.length,1)
    assert.equal((await db.query('select count(*)::int as n from quantum_private.study_room_proposals where room_id=$1',[room.id])).rows[0].n,9,'old authored choices remain in private history')
    const proposal_id=refreshed.sessions[0].proposals[0].id
    await act(ids[0],'vote_schedule',{room_id:room.id,session_number:1,proposal_id})
    const confirmed=await act(ids[0],'confirm_schedule',{room_id:room.id,session_number:1,proposal_id})
    assert.ok(parseStudyRoomDetail(confirmed),'confirmed room projects only selected appointment, not expired choices')
  } finally {await db.close()}
})

test('alias collisions cannot return when deleting a middle member leaves suffix gaps',async()=>{
  const {db,act}=await fixture()
  try {
    const room=await act(ids[0],'create',{course_id:'pnu:AN1500385',level:'beginner'})
    await act(ids[1],'join',{room_id:room.id})
    await act(ids[2],'join',{room_id:room.id})
    await db.query('delete from auth.users where id=$1',[ids[1]])
    const joined=await act(ids[3],'join',{room_id:room.id})
    assert.equal(new Set(joined.members.map(m=>m.alias)).size,3)
    assert.ok(joined.members.some(m=>m.alias==='별친구·3'),'existing member alias is unchanged')
  } finally {await db.close()}
})
