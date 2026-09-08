import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { moveRankedActivity } from '../../components/tonight/ranking'
import { mergeSuperAdminReconciliationExceptions } from '../../components/tonight/reconciliation-exceptions'
import {
  REHEARSAL_STAGES,
  getRehearsalBlockReason,
  isRehearsalStageReady,
} from '../../components/tonight/rehearsal-state'
import { createRehearsalAdapters } from '../../components/tonight/rehearsal-fixtures'
import {
  canBeginTonightDeposit,
  canRequestTonightRefund,
  tonightFinancialNextAction,
} from '../../components/tonight/user-action-policy'
import {
  TONIGHT_DEPOSIT_POLICY_HASH,
  TONIGHT_DEPOSIT_POLICY_VERSION,
} from '../../lib/payments/tonight-deposit-policy'

const ROOT = process.cwd()

function source(relativePath: string): string {
  const absolutePath = join(ROOT, relativePath)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

test('live database application statuses render explicit receipt and withdrawal labels', () => {
  const labels = source('components/tonight/UserTonightExperience.tsx')
    .match(/function applicationStatusLabel[\s\S]+?(?=\nfunction depositStatusLabel)/)?.[0] ?? ''
  assert.match(labels, /\bsubmitted:\s*'신청 완료'/)
  assert.match(labels, /\bwithdrawn:\s*'신청 철회'/)
  for (const status of ['submitted', 'waitlisted', 'allocated', 'withdrawn', 'cancelled']) {
    assert.match(labels, new RegExp(`\\b${status}:`))
  }
})

test('photo ranking always stays a three-item permutation', () => {
  const original = ['bar', 'board', 'dessert'] as const

  assert.deepEqual(moveRankedActivity(original, 'dessert', 1), ['dessert', 'bar', 'board'])
  assert.deepEqual(moveRankedActivity(original, 'bar', 3), ['board', 'dessert', 'bar'])
  assert.deepEqual(moveRankedActivity(original, 'missing', 2), original)
  assert.throws(() => moveRankedActivity(['bar', 'board'] as never, 'bar', 1), /exactly_three/)
})

test('rehearsal time changes are explicit and later gates explain their prerequisite', () => {
  assert.equal(isRehearsalStageReady(0, 0), true)
  assert.equal(isRehearsalStageReady(4, 1), false)
  assert.match(getRehearsalBlockReason(4, 1) ?? '', /보증금.*업장 수락/)
  assert.equal(getRehearsalBlockReason(2, 6), null)
})

test('17:30 rehearsal application does not reveal the 18:32 team early', async () => {
  const { user } = createRehearsalAdapters(0)
  const initial = await user.load()
  const applied = await user.apply({
    roundId: initial.round.id,
    rankedActivityIds: initial.activities.map((activity) => activity.id) as [string, string, string],
    matchingConsentAccepted: true,
    matchingConsentVersion: '2026-09-03',
  })

  assert.equal(applied.application?.status, 'applied')
  assert.equal(applied.journey, null)
  assert.equal(applied.application?.deposit, null)
})

test('17:30 rehearsal keeps the super-admin on the same pre-allocation team state', async () => {
  const { admin, superAdmin } = createRehearsalAdapters(0)
  const [adminData, superAdminData] = await Promise.all([
    admin.load(),
    superAdmin.load(),
  ])

  assert.deepEqual(superAdminData.admin.teams, adminData.teams)
  assert.equal(superAdminData.admin.teams.length, 0)
  assert.equal(superAdminData.teamBundles.length, 0)
})

test('rehearsal keeps team 001 detail, revision, and audit time aligned across roles', async () => {
  const cases = [
    { stage: 1, auditIds: [] },
    { stage: 2, auditIds: ['audit-1'] },
    { stage: 5, auditIds: ['audit-1'] },
    { stage: 6, auditIds: ['audit-1', 'audit-2'] },
    { stage: 7, auditIds: ['audit-1', 'audit-2'] },
  ] as const

  for (const { stage, auditIds } of cases) {
    const { user, partner, admin, superAdmin } = createRehearsalAdapters(stage)
    const [userData, partnerData, adminData] = await Promise.all([
      user.load(),
      partner.load(),
      admin.load(),
    ])
    const partnerTeam = partnerData.teams.find((team) => team.code === 'Q-PNU-20260903-001')
    const adminTeam = adminData.teams.find((team) => team.code === 'Q-PNU-20260903-001')

    assert.ok(partnerTeam, `stage ${stage}: partner team 001`)
    assert.ok(adminTeam, `stage ${stage}: admin team 001`)
    assert.equal(userData.journey?.teamRevision, partnerTeam.teamRevision, `stage ${stage}: user revision`)
    assert.equal(adminTeam.paidCount, partnerTeam.paidMemberCount, `stage ${stage}: admin paid count`)
    assert.equal(adminTeam.arrivedCount, partnerTeam.arrivedMemberCount, `stage ${stage}: admin arrival count`)

    const superData = await superAdmin.load({ teamId: adminTeam.id })
    const teamBundle = superData.teamBundles.find((team) => team.teamId === adminTeam.id)
    assert.equal(teamBundle?.teamRevision, partnerTeam.teamRevision, `stage ${stage}: super-admin revision`)
    assert.equal(
      superData.members.filter((member) => member.depositStatus === 'paid').length,
      partnerTeam.paidMemberCount,
      `stage ${stage}: super-admin paid count`,
    )
    assert.equal(
      superData.members.filter((member) => member.attendanceStatus === 'arrived').length,
      partnerTeam.arrivedMemberCount,
      `stage ${stage}: super-admin arrival count`,
    )
    assert.deepEqual(superData.audit.map((entry) => entry.id), [...auditIds], `stage ${stage}: reached audit entries`)
  }
})

test('user deposit and arrival actions update every role in the same rehearsal instance', async () => {
  const depositAdapters = createRehearsalAdapters(1)
  const depositUserBefore = await depositAdapters.user.load()
  const depositPartnerBefore = await depositAdapters.partner.load()
  const depositTeamBefore = depositPartnerBefore.teams.find((team) => team.id === depositUserBefore.journey?.teamId)
  assert.ok(depositUserBefore.application)
  assert.ok(depositTeamBefore)
  assert.equal(depositTeamBefore.paidMemberCount, 3)

  await depositAdapters.user.beginDeposit({
    applicationId: depositUserBefore.application.id,
    depositPolicyAccepted: true,
    depositPolicyVersion: TONIGHT_DEPOSIT_POLICY_VERSION,
    depositPolicyHash: TONIGHT_DEPOSIT_POLICY_HASH,
  })
  const [depositPartnerAfter, depositAdminAfter] = await Promise.all([
    depositAdapters.partner.load(),
    depositAdapters.admin.load(),
  ])
  const depositTeamAfter = depositPartnerAfter.teams.find((team) => team.id === depositTeamBefore.id)
  const depositAdminTeamAfter = depositAdminAfter.teams.find((team) => team.id === depositTeamBefore.id)
  const depositSuperAfter = await depositAdapters.superAdmin.load({ teamId: depositTeamBefore.id })
  assert.equal(depositTeamAfter?.paidMemberCount, 4)
  assert.equal(depositAdminTeamAfter?.paidCount, 4)
  assert.equal(depositSuperAfter.members.filter((member) => member.depositStatus === 'paid').length, 4)

  const arrivalAdapters = createRehearsalAdapters(5)
  const arrivalUserBefore = await arrivalAdapters.user.load()
  const arrivalPartnerBefore = await arrivalAdapters.partner.load()
  const arrivalTeamBefore = arrivalPartnerBefore.teams.find((team) => team.id === arrivalUserBefore.journey?.teamId)
  assert.ok(arrivalUserBefore.journey?.teamId)
  assert.ok(arrivalTeamBefore)
  assert.equal(arrivalTeamBefore.arrivedMemberCount, 4)

  await arrivalAdapters.user.markArrival({
    teamId: arrivalUserBefore.journey.teamId,
    expectedRevision: arrivalUserBefore.journey.attendanceRevision ?? 0,
  })
  const [arrivalPartnerAfter, arrivalAdminAfter] = await Promise.all([
    arrivalAdapters.partner.load(),
    arrivalAdapters.admin.load(),
  ])
  const arrivalTeamAfter = arrivalPartnerAfter.teams.find((team) => team.id === arrivalTeamBefore.id)
  const arrivalAdminTeamAfter = arrivalAdminAfter.teams.find((team) => team.id === arrivalTeamBefore.id)
  const arrivalSuperAfter = await arrivalAdapters.superAdmin.load({ teamId: arrivalTeamBefore.id })
  assert.equal(arrivalTeamAfter?.arrivedMemberCount, 5)
  assert.equal(arrivalAdminTeamAfter?.arrivedCount, 5)
  assert.equal(arrivalSuperAfter.members.filter((member) => member.attendanceStatus === 'arrived').length, 5)
})

test('18:45 user deposit, missing-arrival identity, and help timestamps match shared fixture truth', async () => {
  const deadlineAdapters = createRehearsalAdapters(2)
  const [deadlineUser, deadlinePartner] = await Promise.all([
    deadlineAdapters.user.load(),
    deadlineAdapters.partner.load(),
  ])
  const deadlineTeam = deadlinePartner.teams.find((team) => team.id === deadlineUser.journey?.teamId)
  assert.equal(deadlineUser.application?.deposit?.status, 'paid')
  assert.equal(deadlineTeam?.paidMemberCount, deadlineTeam?.memberCount)

  const arrivalAdapters = createRehearsalAdapters(5)
  const [arrivalAdmin, arrivalPartner] = await Promise.all([
    arrivalAdapters.admin.load(),
    arrivalAdapters.partner.load(),
  ])
  const missingArrival = arrivalAdmin.exceptions.find((exception) => exception.kind === 'missing_arrival')
  assert.ok(missingArrival?.subjectUserId)
  assert.equal(arrivalPartner.arrivalHelpRequests[0]?.requestedAt, '2026-09-03T10:20:00.000Z')
  const selectedTeam = await arrivalAdapters.superAdmin.load({ teamId: missingArrival.teamId ?? undefined })
  const missingMember = selectedTeam.members.find((member) => member.userId === missingArrival.subjectUserId)
  assert.ok(missingMember)
  assert.equal(missingArrival.subjectName, missingMember.name)
  assert.equal(missingArrival.subjectPhone, missingMember.phone)
})

test('18:50 rehearsal exposes fully paid teams for partner acceptance before venue reveal', async () => {
  const { user, partner } = createRehearsalAdapters(3)
  const [userData, partnerData] = await Promise.all([user.load(), partner.load()])

  assert.equal(userData.application?.deposit?.status, 'paid')
  assert.equal(userData.journey?.teamStatus, 'partner_pending')
  assert.equal(userData.journey?.canRevealExactVenue, false)
  assert.equal(userData.journey?.canMarkArrival, false)
  assert.equal(userData.journey?.place, null)
  assert.ok(partnerData.teams.length > 0)
  assert.ok(partnerData.teams.every((team) => team.paidMemberCount === team.memberCount))
  assert.deepEqual([...new Set(partnerData.teams.map((team) => team.memberCount))].sort(), [5, 6])
  assert.ok(partnerData.teams.every((team) => team.status === 'partner_pending'))
})

test('18:55 rehearsal reveals the accepted team code and exact venue', async () => {
  const { user, partner } = createRehearsalAdapters(4)
  const [userData, partnerData] = await Promise.all([user.load(), partner.load()])

  assert.equal(userData.journey?.teamStatus, 'revealed')
  assert.equal(userData.journey?.canRevealExactVenue, true)
  assert.equal(userData.journey?.canMarkArrival, false)
  assert.equal(userData.journey?.attendanceStatus, 'pending')
  assert.ok(userData.journey?.teamCode)
  assert.ok(userData.journey?.place)
  assert.ok(partnerData.teams.every((team) => team.status === 'revealed'))
})

test('partner acceptance is reflected in the same rehearsal user journey without early venue disclosure', async () => {
  const { user, partner } = createRehearsalAdapters(3)
  const partnerData = await partner.load()
  const team = partnerData.teams[0]
  assert.ok(team)

  await partner.acceptTeam({
    venueId: partnerData.venueId,
    roundId: partnerData.round.id,
    teamId: team.id,
    expectedRevision: team.teamRevision ?? 0,
  })
  const userData = await user.load()

  assert.equal(userData.journey?.teamStatus, 'accepted')
  assert.equal(userData.journey?.canRevealExactVenue, false)
  assert.equal(userData.journey?.canMarkArrival, false)
  assert.equal(userData.journey?.place, null)
})

test('19:20 rehearsal enables arrival with the attendance revision and closes it after one check-in', async () => {
  const { user } = createRehearsalAdapters(5)
  const before = await user.load()
  const journey = before.journey
  assert.ok(journey?.teamId)
  assert.equal(journey.canMarkArrival, true)
  assert.equal(journey.attendanceStatus, 'pending')
  assert.equal(typeof journey.attendanceRevision, 'number')

  const after = await user.markArrival({
    teamId: journey.teamId,
    expectedRevision: journey.attendanceRevision ?? 0,
  })
  assert.equal(after.journey?.attendanceStatus, 'arrived')
  assert.equal(after.journey?.canMarkArrival, false)
  assert.equal(after.journey?.attendanceRevision, (journey.attendanceRevision ?? 0) + 1)
})

test('rehearsal round status follows the selected lifecycle stage', async () => {
  assert.equal((await createRehearsalAdapters(0).admin.load()).rounds[0]?.status, 'open')
  assert.equal((await createRehearsalAdapters(3).admin.load()).rounds[0]?.status, 'partner_confirmation')
  assert.equal((await createRehearsalAdapters(6).admin.load()).rounds[0]?.status, 'in_progress')
  assert.equal((await createRehearsalAdapters(7).admin.load()).rounds[0]?.status, 'completed')
  const terminalUser = await createRehearsalAdapters(7).user.load()
  assert.equal(terminalUser.application?.deposit?.status, 'held')
  assert.equal(terminalUser.application?.deposit?.refundStatus, 'failed')
})

test('19:30 stays in progress and service confirmation opens only at the 20:50 end stage', async () => {
  assert.deepEqual(
    REHEARSAL_STAGES.slice(-2).map(({ time, label }) => [time, label]),
    [['19:30', '모임 시작'], ['20:50', '실참석·정산']],
  )

  const atStart = await createRehearsalAdapters(6).partner.load()
  assert.ok(atStart.teams.length > 0)
  assert.ok(atStart.teams.every((team) => team.status === 'in_progress'))
  assert.ok(atStart.teams.every((team) => team.canConfirmService === false))
  assert.ok(atStart.teams.every((team) => team.confirmedAttendeeCount === null))

  const afterService = await createRehearsalAdapters(7).partner.load()
  assert.ok(afterService.teams.every((team) => team.status === 'completed'))
  assert.ok(afterService.teams.every((team) => team.canConfirmService === true))
  assert.deepEqual(afterService.teams.map((team) => team.confirmedAttendeeCount), [4, 6])
})

test('terminal and unresolved financial journeys never reopen checkout or self-service refund', () => {
  const base = {
    applicationStatus: 'allocated',
    roundStatus: 'awaiting_deposits',
    teamStatus: 'deposit_pending',
  }

  assert.equal(canBeginTonightDeposit({ ...base, depositStatus: 'pending' }), true)
  assert.equal(canRequestTonightRefund({ ...base, depositStatus: 'paid' }), true)

  for (const depositStatus of ['held', 'refund_requested', 'refunded', 'forfeited', 'reconciliation_required', 'cancelled']) {
    const terminal = {
      ...base,
      roundStatus: 'completed',
      teamStatus: 'completed',
      depositStatus,
    }
    assert.equal(canBeginTonightDeposit(terminal), false, `${depositStatus} must not reopen checkout`)
    assert.equal(canRequestTonightRefund(terminal), false, `${depositStatus} must not reopen refund`)
  }

  assert.match(tonightFinancialNextAction({
    ...base,
    roundStatus: 'cancelled',
    teamStatus: 'cancelled',
    depositStatus: 'refund_requested',
    refundStatus: 'failed',
  }), /환불.*확인/)
  assert.match(tonightFinancialNextAction({
    ...base,
    roundStatus: 'completed',
    teamStatus: 'completed',
    depositStatus: 'held',
    refundStatus: null,
  }), /운영자.*확인/)
})

test('rehearsal access grants keep human labels and venue map links distinct', async () => {
  const { superAdmin } = createRehearsalAdapters(6)
  const directory = await superAdmin.searchDirectory('김부산')
  const account = directory.accounts[0]
  const venue = directory.venues[0]

  assert.ok(account)
  assert.ok(venue)

  const granted = await superAdmin.updateMembership({
    subject: account.userId,
    role: 'partner',
    venueId: venue.venueId,
    action: 'grant',
  })
  const created = granted.memberships[0]

  assert.match(created.label, /김부산/)
  assert.equal(created.venueName, venue.name)

  const naverUrls = granted.venueSnapshots
    .map((place) => place.providerLinks.naver?.url)
    .filter((url): url is string => Boolean(url))
  assert.equal(new Set(naverUrls).size, naverUrls.length)
})

test('production Tonight pages render role-specific live components without rehearsal controls', () => {
  const pages = [
    ['app/tonight/(protected)/page.tsx', 'UserTonightExperience'],
    ['app/partner/tonight/page.tsx', 'PartnerTonightConsole'],
    ['app/admin/tonight/page.tsx', 'AdminTonightConsole'],
    ['app/admin/super-admin/tonight/page.tsx', 'SuperAdminTonightConsole'],
  ] as const

  for (const [path, component] of pages) {
    const page = source(path)
    assert.match(page, new RegExp(component), `${path} should render ${component}`)
    assert.match(page, /mode="live"/, `${path} must use live API mode`)
    assert.doesNotMatch(page, /roleSwitcher|fixtureId|User role|Partner role/i)
  }
})

test('user journey includes exactly three photo ranks, secure friend invites, deposit, reveal, map and recovery', () => {
  const user = source('components/tonight/UserTonightExperience.tsx')
  const ranker = source('components/tonight/ActivityRanker.tsx')
  const shell = source('components/tonight/TonightUi.tsx')

  assert.match(user, /ActivityRanker/)
  assert.match(ranker, /snap-x/)
  assert.match(ranker, /lg:grid-cols-3/)
  assert.match(ranker, /fieldset[^>]*className="min-w-0"/)
  assert.match(user, /!isExactlyThreeUniqueActivityIds\(rankedActivities, data\.activities\)/)
  assert.match(user, /!isExactlyThreeUniqueActivityIds\(rankedActivities, latest\.activities\)/)
  assert.match(user, /FriendInviteSharePanel/)
  assert.match(user, /일회용 링크를 최대 2개/)
  assert.match(user, /나이와 비공개 외모 점수가 팀 균형 편성에 내부적으로 사용되며, 점수는 다른 참가자에게 공개되지 않습니다/)
  assert.match(user, /matchingConsentAccepted/)
  assert.match(user, /matchingConsentVersion/)
  assert.match(user, /2026-09-03/)
  assert.match(user, /보증금/)
  assert.match(user, /18:45/)
  assert.match(user, /18:55/)
  assert.match(user, /PlaceMap/)
  assert.match(user, /PlaceLinks/)
  assert.match(user, /도착했어요/)
  assert.match(user, /canMarkArrival/)
  assert.match(user, /journey\.attendanceRevision/)
  assert.match(user, /application\.deposit\.refundStatus/)
  assert.match(user, /canBeginTonightDeposit/)
  assert.match(user, /canRequestTonightRefund/)
  assert.match(user, /신고/)
  assert.match(user, /환불/)
  assert.match(user, /다시 불러오기/)
  assert.match(shell, /<main className="[^"]*overflow-x-hidden[^"]*"/)
})

test('partner, operator and super-admin consoles keep their approved privacy boundaries', () => {
  const partner = source('components/tonight/PartnerTonightConsole.tsx')
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')
  const types = source('components/tonight/types.ts')

  assert.match(partner, /내 업장/)
  assert.doesNotMatch(partner, /업장 선택/)
  assert.match(partner, /paidMemberCount === team\.memberCount/)
  assert.match(partner, /여성 친구 3명.*6명/)
  assert.match(partner, /실제 참석 인원/)
  assert.match(partner, /const acceptLabel = team\.teamRevision === null/)
  assert.match(partner, /aria-label=\{`\$\{team\.code\} \$\{acceptLabel\}`\}/)
  assert.match(partner, /aria-label=\{`\$\{team\.code\} \$\{team\.canConfirmService/)

  assert.match(admin, /남성 신청/)
  assert.match(admin, /여성 신청/)
  assert.match(admin, /연락 필요/)
  assert.match(admin, /미도착|활성 신고/)
  assert.match(admin, /정산 생성 대기/)
  assert.match(admin, /보증금 수동 확인/)
  assert.match(admin, /결제 확인 실패/)
  assert.doesNotMatch(admin, /data\.exceptions\.length\s*\+\s*activeRound\.settlementExceptionCount/)
  assert.doesNotMatch(admin, /전체 전화번호/)

  assert.match(superAdmin, /자동 점수/)
  assert.match(superAdmin, /보정 점수/)
  assert.match(superAdmin, /최종 점수/)
  assert.match(superAdmin, /0~100/)
  assert.match(superAdmin, /친구 묶음/)
  assert.match(superAdmin, /value="excused">사유 인정/)
  assert.match(types, /'pending' \| 'arrived' \| 'no_show' \| 'excused'/)
  assert.match(superAdmin, /계정 검색/)
  assert.match(superAdmin, /이름·이메일로 가입 계정을 찾은 뒤 선택하세요/)
  assert.doesNotMatch(superAdmin, /account\.phone|이름·이메일·전화/)
  assert.match(superAdmin, /업장 목록/)
  assert.doesNotMatch(superAdmin, /사용자 UUID/)
  assert.doesNotMatch(superAdmin, /업장 UUID/)
  assert.match(superAdmin, /장소 원장에 등록할 업장/)
  assert.match(superAdmin, /before/)
  assert.match(superAdmin, /after/)
  assert.doesNotMatch(superAdmin, /사유.*입력|변경 사유/)
})

test('live super-admin adapter maps the revision and effective score emitted by diagnostics', () => {
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(adapter, /diagnostic_team_revision/)
  assert.match(adapter, /diagnostic_effective_appearance_score/)
  assert.match(adapter, /expected_revision: input\.expectedRevision/)
  for (const field of [
    'audit_id',
    'audit_actor_user_id',
    'audit_actor_kind',
    'audit_occurred_at',
    'audit_action',
    'audit_before_state',
    'audit_after_state',
  ]) {
    assert.match(adapter, new RegExp(field))
  }
})

test('live Tonight place projection does not invent a snapshot revision or overstate ambiguous provider links', () => {
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(adapter, /journeyProjectionRevision\(row, roundId\)/)
  assert.match(adapter, /journey-public-v1:/)
  assert.doesNotMatch(
    adapter,
    /snapshotRevision: str\(row\.venue_snapshot_revision, str\(row\.team_id/,
    'a team id is not a venue snapshot revision',
  )
  assert.match(adapter, /kind === 'place' \|\| kind === 'search'/)
  assert.match(adapter, /: 'search'/)
  assert.match(adapter, /providerLink\(row\.venue_naver_url, row\.venue_naver_link_kind\)/)
  assert.match(adapter, /providerLink\(row\.venue_kakao_url, row\.venue_kakao_link_kind\)/)
  assert.match(adapter, /providerLink\(row\.naver_url, row\.naver_link_kind\)/)
  assert.match(adapter, /providerLink\(row\.kakao_url, row\.kakao_link_kind\)/)
  assert.doesNotMatch(adapter, /function providerLink\(url: unknown\): \{ url: string; kind: 'place' \}/)
})

test('live access adapter fetches the selected admin tombstone revision before grant or revoke', () => {
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(
    adapter,
    /\/api\/admin\/super-admin\/tonight\/access\/admin\?user_id=\$\{encodeURIComponent\(input\.subject\)\}/,
  )
  assert.match(adapter, /currentActive = current\?\.is_active === true/)
  assert.match(adapter, /expected_revision: currentRevision/)
  assert.doesNotMatch(
    adapter,
    /expected_revision: currentRevision \?\? 0/,
  )
})

test('live exception mapping preserves every operational payment and settlement exception', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')

  for (const kind of [
    'settlement_finalize_pending',
    'deposit_manual_review',
    'deposit_reconciliation_failed',
  ]) {
    assert.match(types, new RegExp(kind))
    assert.match(adapter, new RegExp(kind))
  }
})

test('rehearsal clearly labels simulated side effects while reusing all four production components', () => {
  const rehearsal = source('components/tonight/TonightReleaseRehearsal.tsx')

  for (const component of [
    'UserTonightExperience',
    'PartnerTonightConsole',
    'AdminTonightConsole',
    'SuperAdminTonightConsole',
  ]) {
    assert.match(rehearsal, new RegExp(component))
  }
  assert.match(rehearsal, /로컬 체험/)
  assert.match(rehearsal, /모든 시간 검증 열기/)
  assert.match(rehearsal, /결제.*저장.*신고.*실제로 처리되지 않/)
  assert.match(rehearsal, /min-h-screen overflow-x-hidden/)
})

test('operator exceptions stay read-only while super-admin alone can retry a dead-letter refund', async () => {
  const types = source('components/tonight/types.ts')
  const adapterSource = source('components/tonight/live-adapters.ts')
  const operator = source('components/tonight/AdminTonightConsole.tsx')
  const superAdminSource = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(types, /refund_dead_letter/)
  assert.match(types, /headcount_mismatch/)
  assert.match(types, /refundRequestId/)
  assert.match(types, /refundRevision/)
  assert.match(types, /retryRefund/)
  assert.match(adapterSource, /\/api\/admin\/super-admin\/tonight\/refunds\/retry/)
  assert.match(adapterSource, /requestId: input\.requestId/)
  assert.match(adapterSource, /expectedRevision: input\.expectedRevision/)
  assert.match(adapterSource, /idempotencyKey: idempotencyKey\('refund_retry'\)/)
  assert.match(adapterSource, /refund_request_revision/)
  assert.match(adapterSource, /const state = asRecord\(partnerAccess\.membership_state\)/)
  assert.match(adapterSource, /expected_revision: currentRevision/)
  assert.doesNotMatch(adapterSource, /expected_revision: num\(current\?\.revision\)/)
  assert.match(adapterSource, /partnerRevision === null \|\| partnerRevision < 1/)
  assert.match(adapterSource, /idempotency_key: idempotencyKey\('partner_grant'\)/)
  assert.match(adapterSource, /idempotency_key: idempotencyKey\('partner_revoke'\)/)

  assert.match(operator, /환불 처리 실패/)
  assert.match(operator, /실참석 인원 불일치/)
  assert.match(operator, /실패 환불 재시도는 최고관리자/)
  assert.doesNotMatch(operator, /실패 환불 재시도 요청/)

  assert.match(superAdminSource, /예외·환불/)
  assert.match(superAdminSource, /실패 환불 재시도 요청/)

  const { admin, superAdmin } = createRehearsalAdapters(7)
  const operatorData = await admin.load()
  const failedRefund = operatorData.exceptions.find((exception) => exception.kind === 'refund_dead_letter')
  assert.ok(failedRefund?.refundRequestId)
  assert.equal(typeof failedRefund.refundRevision, 'number')
  assert.ok(operatorData.exceptions.some((exception) => exception.kind === 'headcount_mismatch'))

  const retryingAdapter = superAdmin as unknown as {
    retryRefund(input: { requestId: string; expectedRevision: number }): ReturnType<typeof superAdmin.load>
  }
  const retried = await retryingAdapter.retryRefund({
    requestId: failedRefund.refundRequestId,
    expectedRevision: failedRefund.refundRevision ?? 0,
  })
  const queued = retried.admin.exceptions.find((exception) => exception.refundRequestId === failedRefund.refundRequestId)
  assert.equal(queued?.status, 'retry_queued')
  assert.equal(queued?.refundRevision, (failedRefund.refundRevision ?? 0) + 1)
})

test('live super-admin preserves reconciliation job revision and wires an actual guarded retry', () => {
  const types = source('components/tonight/types.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const mapper = source('components/tonight/reconciliation-exceptions.ts')
  const operator = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')
  const listRoute = source('app/api/admin/super-admin/tonight/reconciliations/route.ts')
  const retryRoute = source('app/api/admin/super-admin/tonight/reconciliations/retry/route.ts')

  assert.match(types, /reconciliationJobId/)
  assert.match(types, /reconciliationRevision/)
  assert.match(types, /retryReconciliation/)
  assert.doesNotMatch(
    adapter,
    /\/api\/admin\/super-admin\/tonight\/reconciliations\?round_id=/,
    'the main console must not hydrate every reconciliation job; selected exception detail carries its revision',
  )
  assert.match(mapper, /job_id/)
  assert.match(mapper, /job_revision/)
  assert.match(adapter, /\/api\/admin\/super-admin\/tonight\/reconciliations\/retry/)
  assert.match(adapter, /jobId: input\.jobId/)
  assert.match(adapter, /expectedRevision: input\.expectedRevision/)
  assert.match(adapter, /idempotencyKey: idempotencyKey\('reconciliation_retry'\)/)

  assert.match(listRoute, /allowedRoles: \['super_admin'\]/)
  assert.match(listRoute, /requireRecentAuth: true/)
  assert.match(listRoute, /privateJson\(\{ jobs: data \}\)/)
  assert.match(retryRoute, /allowedRoles: \['super_admin'\]/)
  assert.match(retryRoute, /requireRecentAuth: true/)
  assert.match(retryRoute, /super_admin_retry_tonight_reconciliation/)
  assert.match(retryRoute, /p_expected_revision/)
  assert.match(retryRoute, /p_idempotency_key/)

  assert.match(superAdmin, /결제 확인 재시도 요청/)
  assert.match(superAdmin, /adapter\.retryReconciliation/)
  assert.doesNotMatch(operator, /결제 확인 재시도 요청/)

  const merged = mergeSuperAdminReconciliationExceptions([
    {
      kind: 'deposit_reconciliation_failed',
      teamId: 'old-team',
      teamCode: 'OLD',
      subjectUserId: null,
      subjectName: null,
      subjectPhone: null,
      reporterUserId: null,
      reporterName: null,
      reporterPhone: null,
      reportId: null,
      category: null,
      refundRequestId: null,
      refundRevision: null,
      status: 'stale',
    },
  ], [{
    job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    job_revision: 7,
    team_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    team_code: 'PNU-BAR-03',
    job_status: 'failed',
    error_code: 'provider_unavailable',
  }])
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.reconciliationJobId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(merged[0]?.reconciliationRevision, 7)
  assert.equal(merged[0]?.status, 'provider_unavailable')
  assert.throws(() => mergeSuperAdminReconciliationExceptions([], [{
    job_id: 'malformed-without-revision',
    team_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  }]), /결제 확인 작업 응답/)
  assert.throws(() => mergeSuperAdminReconciliationExceptions([], null), /결제 확인 작업 응답/)
})

test('venue snapshot mapping requires independent evidence and timestamps without fabricated fallbacks', () => {
  const adapterSource = source('components/tonight/live-adapters.ts')
  assert.match(adapterSource, /verifiedAddressEvidence\(row\.venue_address_evidence\)/)
  assert.match(adapterSource, /nullableString\(row\.venue_address_verified_at\)/)
  assert.match(adapterSource, /address && addressEvidence && addressVerifiedAt/)
  assert.match(adapterSource, /verifiedCoordinateEvidence\(row\.venue_coordinate_evidence\)/)
  assert.match(adapterSource, /nullableString\(row\.venue_coordinates_verified_at\)/)
  assert.match(adapterSource, /hasVerifiedCoordinates/)
  assert.match(adapterSource, /verifiedAddressEvidence\(row\.address_evidence\)/)
  assert.match(adapterSource, /nullableString\(row\.address_verified_at\)/)
  assert.match(adapterSource, /road && addressEvidence && addressVerifiedAt/)
  assert.match(adapterSource, /verifiedCoordinateEvidence\(row\.coordinate_evidence\)/)
  assert.match(adapterSource, /nullableString\(row\.coordinates_verified_at\)/)
  assert.match(adapterSource, /latitude !== null && longitude !== null && coordinateEvidence && coordinatesVerifiedAt/)
  assert.doesNotMatch(adapterSource, /verifiedAt: nullableString\(row\.created_at\)/)
  assert.match(adapterSource, /address_evidence: 'operator-verified'/)
  assert.match(adapterSource, /address_verified_at: verifiedAt/)
  assert.match(adapterSource, /coordinate_evidence: 'operator-verified'/)
  assert.match(adapterSource, /coordinates_verified_at: verifiedAt/)
})

test('operator receives one masked business contact only after selected detail is loaded', () => {
  const operator = source('components/tonight/AdminTonightConsole.tsx')

  assert.match(operator, /maskedPhone && exception\.detailLoaded && <div/)
  assert.doesNotMatch(operator, /href=\{`tel:/)
  assert.match(operator, /원문 번호는 이 화면에서 제공하지 않습니다/)
})
