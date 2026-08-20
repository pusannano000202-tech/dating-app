import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function findRoomMigration() {
  const migrationDirectory = path.join(process.cwd(), 'supabase/migrations')
  return fs.readdirSync(migrationDirectory)
    .find((file) => file.endsWith('_matching_quantum_event_multi_room_invites.sql'))
}

function findPostMeetingPrivacyMigration() {
  const migrationDirectory = path.join(process.cwd(), 'supabase/migrations')
  return fs.readdirSync(migrationDirectory)
    .find((file) => file.endsWith('_quantum_event_post_meeting_friend_visibility.sql'))
}

test('event applications create numbered rooms and roll overflow into the next room', () => {
  const migrationName = findRoomMigration()
  assert.ok(migrationName, 'multi-room migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)

  assert.match(sql, /room_number\s+integer/i)
  assert.match(sql, /room_code\s+text/i)
  assert.match(sql, /event_id,\s*starts_at,\s*room_number/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /order by[\s\S]*room_number/i)
  assert.match(sql, /max\([^)]*room_number[^)]*\)\s*\+\s*1/i)
  assert.match(sql, /pending_reservations/i)
})

test('room invitations reserve only an active same-gender friend seat for fifteen minutes', () => {
  const migrationName = findRoomMigration()
  assert.ok(migrationName, 'multi-room migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)

  assert.match(sql, /create table[^;]*quantum_event_room_invites/i)
  assert.match(sql, /interval '15 minutes'/i)
  assert.match(sql, /friendships/i)
  assert.match(sql, /status\s*=\s*'active'/i)
  assert.match(sql, /friend_gender_mismatch/i)
  assert.match(sql, /create_quantum_event_room_invite/i)
  assert.match(sql, /accept_quantum_event_room_invite/i)
  assert.match(sql, /expires_at\s*<=\s*pg_catalog\.now\(\)/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.quantum_event_room_invites/i)
})

test('room APIs expose safe counts and exact-room friend invitation actions', () => {
  const roomsRoute = readSource('app/api/match/events/rooms/route.ts')
  const invitesRoute = readSource('app/api/match/event-room-invites/route.ts')
  const acceptRoute = readSource('app/api/match/event-room-invites/accept/route.ts')

  assert.match(roomsRoute, /list_quantum_event_rooms/)
  assert.match(invitesRoute, /create_quantum_event_room_invite/)
  assert.match(invitesRoute, /get_my_quantum_event_room_invites/)
  assert.match(acceptRoute, /accept_quantum_event_room_invite/)
  assert.doesNotMatch(roomsRoute, /appearance_score|display_name|avatar_url/i)
})

test('event lifecycle and application UI identify the assigned room and support friend invite', () => {
  const lifecycle = readSource('lib/matching/quantum-event-lifecycle.ts')
  const application = readSource('components/matching/QuantumEventApplicationStatus.tsx')
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')

  assert.match(lifecycle, /room_number/)
  assert.match(lifecycle, /room_label/)
  assert.match(application, /QuantumEventRoomLobby/)
  assert.match(lobby, /친구 초대/)
  assert.match(lobby, /15분/)
  assert.match(lobby, /getQuantumEventById/)
  assert.match(lobby, /quantumEventPhotos/)
  assert.match(lobby, /익명 좌석/)
  assert.match(lobby, /내 친구/)
  assert.match(lobby, /참여자/)
  assert.match(lobby, /빈자리/)
  assert.match(lobby, /다른 팀 현황/)
  assert.match(lobby, /프로필은 만남 종료 후 친구 연결이 완료되면 열려요/)
  assert.doesNotMatch(lobby, /candidate\.avatar_url/)
})

test('room lobby opens privacy-safe icebreaker cards from gendered anonymous seats', () => {
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')
  const safeCardContract = lobby.match(/type SafeParticipantCard = \{[\s\S]*?\n\}/)?.[0]

  assert.match(lobby, /참가자를 누르면 얼굴 대신 사전 카드를 볼 수 있어요/)
  assert.match(lobby, /aria-modal="true"/)
  assert.match(lobby, /fixed inset-0 z-\[80\] flex items-end[\s\S]*sm:items-center/)
  assert.match(lobby, /남성/)
  assert.match(lobby, /여성/)
  assert.match(lobby, /평소 취향/)
  assert.match(lobby, /대화 에너지/)
  assert.match(lobby, /약속 스타일/)
  assert.match(lobby, /같이 꺼내기 좋은 이야기/)
  assert.match(lobby, /요즘 음악/)
  assert.match(lobby, /공개한 밸런스/)
  assert.match(lobby, /오늘 카드/)
  assert.match(lobby, /사전 카드 연결 준비 중/)
  assert.ok(safeCardContract, 'safe participant card contract must be explicit')
  assert.match(safeCardContract, /intro: string/)
  assert.match(safeCardContract, /mbti: string/)
  assert.match(safeCardContract, /conversationEnergy: string/)
  assert.match(safeCardContract, /planStyle: string/)
  assert.match(safeCardContract, /interests: string\[\]/)
  assert.match(safeCardContract, /music: string/)
  assert.match(safeCardContract, /debateAnswers:/)
  assert.match(safeCardContract, /meetingMoment:/)
  assert.doesNotMatch(safeCardContract, /meetupRole|secretRole|role:/i)
  assert.doesNotMatch(
    safeCardContract,
    /photo|avatar|realName|displayName|department|contact|phone|appearanceScore/i,
  )
  assert.doesNotMatch(lobby, /오늘의 역할/)
  assert.doesNotMatch(lobby, /mapMeetupRole/)
  assert.match(lobby, /친구 자리 1개를 15분 동안 예약했어요/)
  assert.match(lobby, /myAcceptedFriendCount/)
  assert.match(lobby, /myReservedFriendCount/)
  assert.doesNotMatch(lobby, /room\.reserved_total,\s*safePartySize/i)
})

test('B precard presents music and social rhythm as the primary anonymous signals', () => {
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')

  assert.match(lobby, /data-testid="quantum-precard-b"/)
  assert.match(lobby, /취향으로 먼저 인사해요/)
  assert.match(lobby, /data-testid="precard-music-strip"/)
  assert.match(lobby, /말보다 먼저 듣는 플레이리스트/)
  assert.match(lobby, /testId="precard-conversation-spectrum"/)
  assert.match(lobby, /대화의 온도/)
  assert.match(lobby, /testId="precard-plan-spectrum"/)
  assert.match(lobby, /약속의 리듬/)
  assert.match(lobby, /ConversationSpectrum/)
})

test('room lobby surfaces participant card service failures instead of showing empty cards', () => {
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')

  assert.match(lobby, /participantsResponse\.status === 503/)
  assert.match(lobby, /!participantsResponse\.ok/)
  assert.doesNotMatch(lobby, /participantsResponse\.ok[\s\S]*?: \{ participants: \[\] \}/)
})

test('participant card dialog closes with browser back and never invents missing answers', () => {
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')

  assert.match(lobby, /window\.history\.pushState/i)
  assert.match(lobby, /popstate/i)
  assert.match(lobby, /아직 적지 않았어요/i)
  assert.doesNotMatch(lobby, /편하게 대화를 시작하고 싶어요/)
})

test('confirmed event screens keep opponents private and expose post-meeting actions only after completion', () => {
  const application = readSource('components/matching/QuantumEventApplicationStatus.tsx')

  assert.match(application, /deriveQuantumEventLifecycleStage/)
  assert.match(application, /savedStage === 'recruiting'/)
  assert.match(application, /만남 종료 전에는 참가자 사진과 상세 프로필을 공개하지 않아요/)
  assert.match(application, /행사 전용 가명/)
  assert.match(application, /quantumEventPhotos/)
  assert.match(application, /실제 참가자 사진 아님/)
  assert.match(application, /event\.title/)
  assert.match(application, /MeetingEvidencePanel/)
  assert.match(application, /match\/\$\{encodeURIComponent\(matchId\)\}\/review\?event=/)
  assert.match(application, /친구 프로필 보기/)
  assert.doesNotMatch(application, /opponent.*avatar|opponent.*photo/i)
})

test('event chat and legacy match APIs do not expose participant identity before completion', () => {
  const chatRoute = readSource('app/api/matches/[id]/chat/route.ts')
  const chatPage = readSource('app/match/[id]/chat/page.tsx')
  const detailRoute = readSource('app/api/matches/[id]/route.ts')
  const connectionRoute = readSource('app/api/matches/[id]/connections/route.ts')
  const migration = readSource('supabase/migrations/20260813173000_quantum_event_identity_surface_hardening.sql')

  assert.match(chatRoute, /get_safe_match_chat_messages/)
  assert.match(chatRoute, /send_safe_match_chat_message/)
  assert.doesNotMatch(chatRoute, /current_user_id/)
  assert.match(chatPage, /is_mine/)
  assert.doesNotMatch(chatPage, /sender_user_id|currentUserId/)

  assert.match(detailRoute, /get_quantum_event_match_route/)
  assert.match(detailRoute, /event_match_profiles_private/)
  assert.match(detailRoute, /eventRoute !== null/)
  assert.match(detailRoute, /event_route_invalid/)
  assert.match(connectionRoute, /get_quantum_event_match_route/)
  assert.match(migration, /get_quantum_event_match_route/)
  assert.match(migration, /event_match_contact_hidden/)
  assert.match(migration, /revoke all on function public\.get_match_chat_messages/i)
  assert.match(migration, /revoke all on function public\.send_match_chat_message/i)
})

test('event privacy stages have a development-only visual review page', () => {
  const previewPage = readSource('app/dev/event-privacy-preview/page.tsx')
  const application = readSource('components/matching/QuantumEventApplicationStatus.tsx')

  assert.match(previewPage, /process\.env\.NODE_ENV\s*===\s*'production'/)
  assert.match(previewPage, /QuantumEventSavedStage/)
  assert.match(previewPage, /confirmed|chat_open|in_progress|completed/)
  assert.match(application, /devPreview=\{devPreview\}/)
})

test('anonymous room preview includes the sealed own role and before-after guessing states', () => {
  const previewPage = readSource('app/dev/event-room-lobby-preview/page.tsx')

  assert.match(previewPage, /process\.env\.NODE_ENV\s*===\s*'production'/)
  assert.match(previewPage, /QuantumEventRoomLobby/)
  assert.match(previewPage, /QuantumSecretRoleCard/)
  assert.match(previewPage, /QuantumRoleGuessing/)
  assert.match(previewPage, /phase === 'after'/)
  assert.match(previewPage, /meetingCompleted=\{showAfterMeeting\}/)
  assert.match(previewPage, /initialState=\{showAfterMeeting/)
})

test('event review returns to the event screen instead of the legacy match detail', () => {
  const application = readSource('components/matching/QuantumEventApplicationStatus.tsx')
  const reviewPage = readSource('app/match/[id]/review/page.tsx')

  assert.match(application, /event=\$\{encodeURIComponent\(lifecycle\.event_id\)\}/)
  assert.match(application, /party=\$\{encodeURIComponent\(lifecycle\.party_type\)\}/)
  assert.match(reviewPage, /useSearchParams/)
  assert.match(reviewPage, /getQuantumEventById/)
  assert.match(reviewPage, /isQuantumPartyType/)
  assert.match(reviewPage, /backHref/)
})

test('pre-meeting room contracts expose counts but never other participant profiles', () => {
  const migrationName = findRoomMigration()
  assert.ok(migrationName, 'multi-room migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)
  const roomsRoute = readSource('app/api/match/events/rooms/route.ts')
  const lifecycle = readSource('lib/matching/quantum-event-lifecycle.ts')

  assert.match(sql, /'display_name',\s*CASE WHEN my_party\.user_id = v_user_id THEN '나' ELSE '내 친구' END/i)
  assert.match(sql, /'avatar_url',\s*NULL/i)
  assert.doesNotMatch(roomsRoute, /signPrivateProfilePhotos|photo_url|avatar_url/i)
  assert.match(lifecycle, /display_name/)
  assert.match(lifecycle, /avatar_url/)
})

test('completed event matches connect participants without reviving a hidden relationship', () => {
  const migrationName = findPostMeetingPrivacyMigration()
  assert.ok(migrationName, 'post-meeting privacy migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)

  assert.match(sql, /complete_due_quantum_event_matches/i)
  assert.match(sql, /quantum_event_match_members/i)
  assert.match(sql, /insert into public\.friendships/i)
  assert.match(sql, /status\s*=\s*'completed'/i)
  assert.match(sql, /status\s*=\s*'blocked'/i)
  assert.match(sql, /on conflict[^;]*do nothing/i)
  assert.match(sql, /cron\.schedule/i)
  assert.doesNotMatch(sql, /do update[\s\S]*status\s*=\s*'active'/i)
})

test('friend removal is reversible only by the blocker and blocks future room assignment', () => {
  const migrationName = findPostMeetingPrivacyMigration()
  assert.ok(migrationName, 'post-meeting privacy migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)
  const api = readSource('app/api/friends/[id]/connection/route.ts')
  const friendsPage = readSource('app/friends/page.tsx')

  assert.match(sql, /blocked_by/i)
  assert.match(sql, /remove_friend_and_exclude/i)
  assert.match(sql, /restore_friend_visibility/i)
  assert.match(sql, /friendship\.status\s*=\s*'blocked'/i)
  assert.match(sql, /friendship\.blocked_by\s*=\s*v_caller/i)
  assert.match(sql, /match_pair_excluded/i)
  assert.match(sql, /quantum_event_room_has_blocked_pair/i)
  assert.match(sql, /has_blocked_member_pair_between_groups/i)
  assert.match(api, /remove_friend_and_exclude/)
  assert.match(api, /restore_friend_visibility/)
  assert.match(friendsPage, /연결 숨기기/)
  assert.match(friendsPage, /다시 연결/)
})

test('friend profile details stay behind an active friendship gate', () => {
  const migrationName = findPostMeetingPrivacyMigration()
  assert.ok(migrationName, 'post-meeting privacy migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)
  const profileApi = readSource('app/api/friends/[id]/profile/route.ts')

  assert.match(sql, /get_friend_profile_summary/i)
  assert.match(sql, /friendship\.status\s*=\s*'active'/i)
  assert.match(profileApi, /get_friend_profile_summary/)
  assert.match(profileApi, /active_friendship_required/)
  assert.match(profileApi, /signPrivateProfilePhotos/)
})

test('cancelling participation returns the participation result, not the later invite cleanup result', () => {
  const migrationName = findRoomMigration()
  assert.ok(migrationName, 'multi-room migration must exist')
  const sql = readSource(`supabase/migrations/${migrationName}`)
  const cancelFunction = sql.match(
    /create or replace function public\.cancel_my_quantum_event_participation\(\)[\s\S]*?\n\$\$;/i,
  )?.[0]

  assert.ok(cancelFunction, 'cancel function must exist')
  assert.match(cancelFunction, /v_cancelled\s+boolean\s*:=\s*false/i)
  assert.match(cancelFunction, /v_cancelled\s*:=\s*found/i)
  assert.match(cancelFunction, /return\s+v_cancelled/i)
  assert.doesNotMatch(cancelFunction, /return\s+found/i)
})

test('room lobby has a development-only visual review page using the production component', () => {
  const previewPage = readSource('app/dev/event-room-lobby-preview/page.tsx')
  const lobby = readSource('components/matching/QuantumEventRoomLobby.tsx')

  assert.match(previewPage, /process\.env\.NODE_ENV\s*===\s*'production'/)
  assert.match(previewPage, /QuantumEventRoomLobby/)
  assert.match(previewPage, /preview/)
  assert.match(lobby, /디자인 미리보기 · 저장되지 않음/)
  assert.match(previewPage, /bg-\[#FFF8F5\]/)
  assert.doesNotMatch(previewPage, /bg-\[#EAF7F5\]/)
  assert.match(lobby, /이 참가자는 아직 사전 카드를 작성하지 않았어요/)
  assert.match(lobby, /setParticipants\(PREVIEW_PARTICIPANTS\)/)
  assert.match(lobby, /gender:\s*'male'/)
})
