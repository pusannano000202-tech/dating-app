import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { nativeFullFixture, ids } from '../meetups/native-admission-full-fixture.mjs'
export { ids }
const source = name => readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')

// Disposable PGlite only. Membership admissions below bypass checkout solely to
// exercise native room authorization; this is not payment/admission evidence.
export async function nativePollFixture({ apply = true } = {}) {
  const f = await nativeFullFixture()
  try {
    const original = await source('20260908164747_activity_room_chat_polls.sql')
    // social-chat's minimal friendship stub omits the production unique pair.
    await f.db.exec('alter table public.friendships add unique(user_id,friend_user_id)')
    // The underlying fixture already executes the original first four tables.
    await f.db.exec('begin;\n' + original.slice(original.indexOf('create table quantum_private.activity_room_poll_agreements (')))
    await f.db.exec(await source('20260911141729_league_team_private_polls.sql'))
    const migrate = async () => f.db.exec(await source('20260913103841_native_study_mentoring_chat_polls.sql'))
    if (apply) await migrate()
    const study = await f.rpc(ids[0], 'study_room_action', ['create_hosted', JSON.stringify({
      course_id: 'pnu:AN1600527', level: 'beginner', title: '투표 검증 스터디', client_id: randomUUID(),
    })])
    await f.db.query('select quantum_private.hosted_study_admit($1,$2,$3)', [study.id, ids[1], '{}'])
    const mentoring = await f.create(ids[0])
    await f.admit(mentoring.room.id, ids[1])
    const rooms = { study_room: study.id, mentoring: mentoring.room.id }
    const read = (kind, user = ids[0], room = rooms[kind]) => f.rpc(user, 'get_chat_room_polls', [kind, room])
    const createPoll = (kind, user = ids[0], more = {}) => f.rpc(user, 'create_chat_room_poll', [
      kind, more.room ?? rooms[kind], more.purpose ?? 'general', more.title ?? '직접 정한 질문',
      more.mode ?? 'single', more.options ?? ['첫 번째 선택', '두 번째 선택'], more.key ?? randomUUID(),
    ])
    const vote = (kind, poll, options, user = ids[1], room = rooms[kind]) => f.rpc(user, 'vote_chat_room_poll', [kind, room, poll, options])
    return { ...f, rooms, migrate, read, createPoll, vote }
  } catch (error) { await f.db.close(); throw error }
}
