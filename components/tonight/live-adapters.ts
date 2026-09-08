'use client'

import { requestTossPaymentWindow } from '@/lib/payments/toss-browser'
import {
  PLACE_ADDRESS_EVIDENCE,
  PLACE_COORDINATE_EVIDENCE,
  type PlaceAddressEvidence,
  type PlaceCoordinateEvidence,
  type PlaceLinkKind,
  type PublicPlaceDto,
} from '@/lib/places/contracts'
import { projectVenueSnapshotRow } from '@/lib/places/venue-snapshot'

import type {
  AccessMembershipView,
  AdminExceptionView,
  AdminRoundView,
  AdminTeamSummary,
  AdminTonightAdapter,
  AdminTonightData,
  PartnerCapacityView,
  PartnerTeamView,
  PartnerTonightAdapter,
  PartnerTonightData,
  SuperAdminMemberView,
  SuperAdminTonightAdapter,
  SuperAdminTonightData,
  TonightActivityCard,
  TonightArrivalHelpView,
  TonightApplicationView,
  TonightJourneyView,
  TonightRoundView,
  UserApplyInput,
  UserTonightAdapter,
  UserTonightData,
} from './types'
import { parseParticipationSummary } from '@/lib/participation/summary'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as UnknownRecord
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asTeamHeadcount(value: unknown): 5 | 6 {
  return value === 6 ? 6 : 5
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bool(value: unknown): boolean {
  return value === true
}

const TONIGHT_APPLICATIONS_OPEN_KEY = 'tonight_applications_open'

function readDatabaseApplicationsOpen(payload: UnknownRecord): boolean {
  if (
    payload.key !== TONIGHT_APPLICATIONS_OPEN_KEY
    || typeof payload.value !== 'boolean'
  ) {
    throw new Error('DB 신청 Gate 상태를 안전하게 확인하지 못했어요.')
  }
  return payload.value
}

function idempotencyKey(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${random}`.slice(0, 120)
}

const ERROR_LABELS: Record<string, string> = {
  not_authenticated: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  forbidden: '이 작업을 수행할 권한이 없어요.',
  reauthentication_required: '민감한 정보를 보호하기 위해 다시 로그인해 주세요.',
  not_found: '요청한 정보를 찾지 못했어요.',
  stale_revision: '다른 곳에서 상태가 먼저 바뀌었어요. 새로고침 후 다시 시도해 주세요.',
  applications_closed: '운영자가 방금 신청을 닫았어요. 새로고침해 최신 상태를 확인해 주세요.',
  service_unavailable: '서비스 연결이 원활하지 않아요. 잠시 뒤 다시 시도해 주세요.',
  photo_service_unavailable: '프로필 사진을 안전하게 불러오지 못했어요.',
  payment_not_ready: '결제 준비가 끝나지 않았어요. 잠시 뒤 다시 시도해 주세요.',
  attendance_reconciliation_required: '업장 입력 인원과 사용자 도착 표시가 달라요. 기록은 보존됐으며 운영자 확인이 필요합니다.',
}

async function requestJson(path: string, init?: RequestInit): Promise<UnknownRecord> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = asRecord(await response.json().catch(() => ({})))
  if (!response.ok) {
    const code = str(payload.error, 'service_unavailable')
    if (code === 'reauthentication_required' && typeof window !== 'undefined') {
      const redirect = `${window.location.pathname}${window.location.search}`
      window.location.assign(`/login?reauth=1&redirect=${encodeURIComponent(redirect)}`)
    }
    throw new Error(ERROR_LABELS[code] ?? '요청을 처리하지 못했어요.')
  }
  return payload
}

function postJson(path: string, body: UnknownRecord): Promise<UnknownRecord> {
  return requestJson(path, { method: 'POST', body: JSON.stringify(body) })
}

function deleteJson(path: string, body: UnknownRecord): Promise<UnknownRecord> {
  return requestJson(path, { method: 'DELETE', body: JSON.stringify(body) })
}

function mapRound(value: unknown): TonightRoundView {
  const row = asRecord(value)
  return {
    id: str(row.id),
    marketCode: str(row.market_code, 'PNU'),
    serviceDate: str(row.service_date),
    status: str(row.status),
    signupCloseAt: str(row.signup_close_at),
    capacityLockAt: str(row.capacity_lock_at, str(row.signup_close_at)),
    allocationPublishAt: str(row.allocation_publish_at),
    depositDueAt: str(row.deposit_due_at),
    partnerAcceptanceDueAt: str(row.partner_acceptance_due_at),
    revealAt: str(row.reveal_at),
    arrivalAt: str(row.arrival_at),
    startsAt: str(row.starts_at),
  }
}

function mapActivity(value: unknown): TonightActivityCard {
  const row = asRecord(value)
  const kind = str(row.kind, 'other')
  return {
    id: str(row.id),
    title: str(row.title, '오늘밤 활동'),
    description: str(row.description, '다섯 명이 함께 즐기는 구체적인 활동이에요.'),
    imageUrl: str(row.image_url, '/images/match/events/event-dinner.webp'),
    imageAlt: `${str(row.title, '오늘밤 활동')}을 함께 즐기는 사람들`,
    durationMinutes: num(row.duration_minutes, kind === 'board_game' ? 80 : 70),
    kind,
  }
}

function mapApplication(value: unknown): TonightApplicationView | null {
  const row = asRecord(value)
  if (!str(row.id)) return null
  const bundle = asRecord(row.bundle)
  const deposit = asRecord(row.deposit)
  return {
    id: str(row.id),
    status: str(row.status),
    revision: num(row.revision),
    choices: asArray(row.choices).map((choice) => {
      const item = asRecord(choice)
      return { activityId: str(item.activity_id), rank: num(item.rank) }
    }),
    bundle: str(bundle.id) ? {
      id: str(bundle.id),
      status: str(bundle.status),
      maxSize: num(bundle.max_size, 3),
      memberCount: num(bundle.member_count, 1),
    } : null,
    deposit: str(deposit.status) ? {
      status: str(deposit.status),
      amount: num(deposit.amount),
      revision: num(deposit.revision),
      refundStatus: nullableString(deposit.refund_status),
      refundRevision: nullableNumber(deposit.refund_revision),
    } : null,
  }
}

function providerLink(url: unknown, kind: unknown): { url: string; kind: PlaceLinkKind } | null {
  const link = nullableString(url)
  if (!link) return null

  // Older public RPCs return the provider URL without its stored link kind.
  // In that ambiguous case, describe the destination conservatively as a
  // search instead of claiming that it is an exact provider place page.
  const safeKind: PlaceLinkKind = kind === 'place' || kind === 'search'
    ? kind
    : 'search'
  return { url: link, kind: safeKind }
}

function publicProjectionFingerprint(value: readonly unknown[]): string {
  const source = JSON.stringify(value)
  let primary = 0x811c9dc5
  let secondary = 0x9e3779b9

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index)
    primary = Math.imul(primary ^ code, 0x01000193)
    secondary = Math.imul(secondary ^ code, 0x85ebca6b)
  }

  return [primary, secondary]
    .map((hash) => (hash >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

function journeyProjectionRevision(row: UnknownRecord, roundId: string): string {
  const sourceRevision = nullableString(row.venue_snapshot_revision)
  if (sourceRevision) return sourceRevision

  // get_my_tonight_journey does not currently expose the immutable snapshot
  // revision. Derive a clearly namespaced revision from only the public place
  // projection so its identity changes when any returned place fact changes;
  // never substitute a team id as though it were a venue snapshot revision.
  const publicProjection = [
    roundId,
    nullableString(row.venue_display_name),
    nullableString(row.venue_address),
    nullableString(row.venue_address_evidence),
    nullableString(row.venue_address_verified_at),
    nullableNumber(row.venue_latitude),
    nullableNumber(row.venue_longitude),
    nullableString(row.venue_coordinate_evidence),
    nullableString(row.venue_coordinates_verified_at),
    nullableString(row.venue_naver_url),
    nullableString(row.venue_naver_link_kind),
    nullableString(row.venue_kakao_url),
    nullableString(row.venue_kakao_link_kind),
  ] as const
  return `journey-public-v1:${publicProjectionFingerprint(publicProjection)}`
}

function mapJourney(value: unknown, roundId: string): TonightJourneyView | null {
  const row = asRecord(value)
  if (!str(row.application_id)) return null
  const canReveal = bool(row.can_reveal_exact_venue)
  const venueName = nullableString(row.venue_display_name)
  const address = nullableString(row.venue_address)
  const addressEvidence = verifiedAddressEvidence(row.venue_address_evidence)
  const addressVerifiedAt = nullableString(row.venue_address_verified_at)
  const latitude = nullableNumber(row.venue_latitude)
  const longitude = nullableNumber(row.venue_longitude)
  const coordinateEvidence = verifiedCoordinateEvidence(row.venue_coordinate_evidence)
  const coordinatesVerifiedAt = nullableString(row.venue_coordinates_verified_at)
  const hasVerifiedCoordinates = latitude !== null
    && longitude !== null
    && coordinateEvidence !== null
    && coordinatesVerifiedAt !== null
  const place: PublicPlaceDto | null = canReveal && venueName
    ? {
        placeRef: `tonight:${roundId}:${str(row.team_id, 'team')}`,
        snapshotRevision: journeyProjectionRevision(row, roundId),
        displayName: venueName,
        category: 'activity',
        areaLabel: '부산대 생활권',
        address: address && addressEvidence && addressVerifiedAt
          ? { road: address, evidence: addressEvidence, verifiedAt: addressVerifiedAt }
          : null,
        coordinates: hasVerifiedCoordinates ? {
          latitude,
          longitude,
          evidence: coordinateEvidence,
          verifiedAt: coordinatesVerifiedAt,
        } : null,
        providerLinks: {
          naver: providerLink(row.venue_naver_url, row.venue_naver_link_kind),
          kakao: providerLink(row.venue_kakao_url, row.venue_kakao_link_kind),
        },
      }
    : null

  return {
    applicationId: str(row.application_id),
    applicationStatus: str(row.application_status),
    teamId: nullableString(row.team_id),
    teamRevision: nullableNumber(row.team_revision),
    teamCode: canReveal ? nullableString(row.team_code) : null,
    teamStatus: nullableString(row.team_status),
    activityTitle: nullableString(row.activity_title),
    canRevealExactVenue: canReveal,
    attendanceStatus: nullableString(row.attendance_status),
    attendanceRevision: nullableNumber(row.attendance_revision),
    canMarkArrival: bool(row.can_mark_arrival),
    place,
  }
}

function mapArrivalHelp(value: unknown, fallbackVenueName: string | null = null): TonightArrivalHelpView | null {
  const row = asRecord(value)
  const requestId = str(row.request_id)
  const teamId = str(row.team_id)
  if (!requestId || !teamId) return null
  const category = str(row.category)
  const status = str(row.status)
  if (!['entrance', 'team', 'venue'].includes(category)) return null
  if (!['requested', 'acknowledged', 'escalated', 'resolved', 'cancelled'].includes(status)) return null
  const nextActor = nullableString(row.next_actor)
    ?? (status === 'escalated' ? 'operator' : status === 'requested' || status === 'acknowledged' ? 'partner' : null)
  return {
    requestId,
    teamId,
    teamCode: str(row.team_code),
    venueName: nullableString(row.venue_name) ?? fallbackVenueName,
    category: category as TonightArrivalHelpView['category'],
    status: status as TonightArrivalHelpView['status'],
    revision: num(row.revision),
    requestedAt: str(row.requested_at),
    updatedAt: str(row.updated_at),
    nextActor: nextActor === 'participant' || nextActor === 'partner' || nextActor === 'operator'
      ? nextActor
      : null,
    nextAction: str(row.next_action, '현장 담당자가 요청을 확인하고 있어요.'),
  }
}

export function createLiveUserTonightAdapter(): UserTonightAdapter {
  const load = async (): Promise<UserTonightData> => {
    const response = await requestJson('/api/tonight')
    const root = asRecord(response.round)
    if (!str(asRecord(root.round).id)) throw new Error('오늘 진행 중인 부산대 회차가 없어요.')
    const round = mapRound(root.round)
    const activities = asArray(root.activities).map(mapActivity)
    if (activities.length !== 3) throw new Error('오늘 활동 3개가 아직 준비되지 않았어요.')
    const application = mapApplication(root.application)
    const journeyResponse = application
      ? await requestJson(`/api/tonight/journey?round_id=${encodeURIComponent(round.id)}`)
      : null
    const journey = journeyResponse ? mapJourney(journeyResponse.journey, round.id) : null
    const arrivalHelpResponse = journey?.teamId && journey.canRevealExactVenue
      ? await requestJson(`/api/tonight/arrival-help?team_id=${encodeURIComponent(journey.teamId)}`)
      : null
    return {
      round,
      activities: activities as [TonightActivityCard, TonightActivityCard, TonightActivityCard],
      applicationsOpen: bool(response.applications_open),
      participationSummary: parseParticipationSummary(response.participation_summary),
      application,
      journey,
      arrivalHelpRequest: arrivalHelpResponse
        ? mapArrivalHelp(arrivalHelpResponse.arrival_help, journey?.place?.displayName ?? null)
        : null,
    }
  }

  return {
    load,
    async apply(input: UserApplyInput) {
      await postJson('/api/tonight/apply', {
        round_id: input.roundId,
        ranked_activity_ids: input.rankedActivityIds,
        matching_consent_accepted: input.matchingConsentAccepted,
        matching_consent_version: input.matchingConsentVersion,
        idempotency_key: idempotencyKey('apply'),
      })
      return load()
    },
    async beginDeposit(input) {
      const response = await postJson('/api/payments/tonight-deposit', {
        application_id: input.applicationId,
        deposit_policy_accepted: input.depositPolicyAccepted,
        deposit_policy_version: input.depositPolicyVersion,
        deposit_policy_hash: input.depositPolicyHash,
        idempotency_key: idempotencyKey('deposit'),
        return_path: '/tonight',
      })
      const checkout = asRecord(response.checkout)
      await requestTossPaymentWindow({
        provider: 'toss',
        clientKey: str(checkout.clientKey),
        customerKey: str(checkout.customerKey),
        amount: num(checkout.amount),
        orderId: str(checkout.orderId),
        orderName: str(checkout.orderName),
        successUrl: str(checkout.successUrl),
        failUrl: str(checkout.failUrl),
        method: 'CARD',
      })
      return {}
    },
    async markArrival(input) {
      await postJson('/api/tonight/arrival', {
        team_id: input.teamId,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('arrival'),
      })
      return load()
    },
    async requestArrivalHelp(input) {
      await postJson('/api/tonight/arrival-help', {
        team_id: input.teamId,
        category: input.category,
        idempotency_key: idempotencyKey('arrival_help'),
      })
      return load()
    },
    async cancelArrivalHelp(input) {
      await deleteJson('/api/tonight/arrival-help', {
        request_id: input.requestId,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('arrival_help_cancel'),
      })
      return load()
    },
    async report(input) {
      const response = await postJson('/api/tonight/report', {
        team_id: input.teamId,
        category: input.category,
        description: input.description,
        idempotency_key: idempotencyKey('report'),
      })
      return { reportId: str(response.report_id) }
    },
    async requestRefund(input) {
      const response = await postJson('/api/tonight/refund', {
        application_id: input.applicationId,
        expected_deposit_revision: input.expectedDepositRevision,
        idempotency_key: idempotencyKey('refund'),
      })
      return { refundRequestId: str(response.refund_request_id) }
    },
  }
}

const VERIFIED_ADDRESS_EVIDENCE = new Set<string>(
  PLACE_ADDRESS_EVIDENCE.filter((evidence) => evidence !== 'host-supplied'),
)
const VERIFIED_COORDINATE_EVIDENCE = new Set<string>(PLACE_COORDINATE_EVIDENCE)

function verifiedAddressEvidence(value: unknown): PlaceAddressEvidence | null {
  const evidence = nullableString(value)
  return evidence && VERIFIED_ADDRESS_EVIDENCE.has(evidence) ? evidence as PlaceAddressEvidence : null
}

function verifiedCoordinateEvidence(value: unknown): PlaceCoordinateEvidence | null {
  const evidence = nullableString(value)
  return evidence && VERIFIED_COORDINATE_EVIDENCE.has(evidence) ? evidence as PlaceCoordinateEvidence : null
}

export function mapPlaceFromSnapshot(value: unknown, venueId: string): PublicPlaceDto {
  const row = asRecord(value)
  const road = nullableString(row.address)
  const addressEvidence = verifiedAddressEvidence(row.address_evidence)
  const addressVerifiedAt = nullableString(row.address_verified_at)
  const latitude = nullableNumber(row.latitude)
  const longitude = nullableNumber(row.longitude)
  const coordinateEvidence = verifiedCoordinateEvidence(row.coordinate_evidence)
  const coordinatesVerifiedAt = nullableString(row.coordinates_verified_at)
  return {
    placeRef: `venue:${venueId}`,
    snapshotRevision: str(row.id, str(row.snapshot_revision)),
    displayName: str(row.display_name, '내 업장'),
    category: 'activity',
    areaLabel: str(row.area_label, '부산대 생활권'),
    address: road && addressEvidence && addressVerifiedAt ? {
      road,
      evidence: addressEvidence,
      verifiedAt: addressVerifiedAt,
    } : null,
    coordinates: latitude !== null && longitude !== null && coordinateEvidence && coordinatesVerifiedAt ? {
      latitude,
      longitude,
      evidence: coordinateEvidence,
      verifiedAt: coordinatesVerifiedAt,
    } : null,
    providerLinks: {
      naver: providerLink(row.naver_url, row.naver_link_kind),
      kakao: providerLink(row.kakao_url, row.kakao_link_kind),
    },
  }
}

export function createLivePartnerTonightAdapter(): PartnerTonightAdapter {
  let currentRoundId = ''
  let currentVenueId = ''

  const load = async (): Promise<PartnerTonightData> => {
    const setupResponse = await requestJson(currentRoundId
      ? `/api/partner/tonight/setup?round_id=${encodeURIComponent(currentRoundId)}`
      : '/api/partner/tonight/setup')
    const setup = asRecord(setupResponse.setup)
    const round = mapRound(setup.round)
    currentRoundId = round.id
    const venues = asArray(setup.venues).map(asRecord)
    if (venues.length !== 1) {
      throw new Error(venues.length === 0
        ? '이 계정에 연결된 업장이 없어요. 최고관리자에게 연결을 요청해 주세요.'
        : '한 계정에 여러 업장이 연결돼 있어요. 최고관리자에게 계정 연결을 정리해 달라고 요청해 주세요.')
    }
    const venue = venues[0]
    currentVenueId = str(venue.venue_id)
    const snapshot = asRecord(venue.snapshot)
    const activities = asArray(setup.activities).map(asRecord)
    const titleById = new Map(activities.map((activity) => [str(activity.id), str(activity.title)]))
    const capacities: PartnerCapacityView[] = asArray(venue.capacities).map((value) => {
      const row = asRecord(value)
      const activityId = str(row.activity_id)
      return {
        id: str(row.id, activityId),
        activityId,
        activityTitle: titleById.get(activityId) ?? '오늘밤 활동',
        teamCapacity: num(row.team_capacity),
        maxTeamHeadcount: asTeamHeadcount(row.max_team_headcount),
        reservedTeamCount: num(row.reserved_team_count),
        status: str(row.status),
        revision: num(row.revision),
      }
    })
    const [dashboardResponse, arrivalHelpResponse] = await Promise.all([
      requestJson(`/api/partner/tonight/dashboard?round_id=${encodeURIComponent(round.id)}&venue_id=${encodeURIComponent(currentVenueId)}`),
      requestJson(`/api/partner/tonight/arrival-help?round_id=${encodeURIComponent(round.id)}&venue_id=${encodeURIComponent(currentVenueId)}`),
    ])
    const teamsById = new Map<string, PartnerTeamView>()
    for (const value of asArray(dashboardResponse.dashboard)) {
      const row = asRecord(value)
      const teamId = str(row.team_id)
      if (!teamId) continue
      teamsById.set(teamId, {
        id: teamId,
        code: str(row.team_code),
        status: str(row.team_status),
        activityTitle: str(row.activity_title),
        teamRevision: nullableNumber(row.team_revision),
        memberCount: num(row.member_count, 5),
        paidMemberCount: num(row.paid_member_count),
        arrivedMemberCount: num(row.arrived_member_count),
        confirmedAttendeeCount: nullableNumber(row.confirmed_attendee_count),
        serviceRevision: nullableNumber(row.service_confirmation_revision),
        serviceConfirmAfter: str(row.service_confirm_after),
        canConfirmService: row.can_confirm_service === true,
      })
    }
    return {
      round,
      venueId: currentVenueId,
      venueSnapshotId: str(snapshot.id),
      venueName: str(snapshot.display_name),
      place: mapPlaceFromSnapshot(snapshot, currentVenueId),
      capacities,
      teams: [...teamsById.values()],
      arrivalHelpRequests: asArray(arrivalHelpResponse.arrival_help)
        .map((value) => mapArrivalHelp(value, str(snapshot.display_name)))
        .filter((value): value is TonightArrivalHelpView => value !== null),
    }
  }

  return {
    load,
    async saveCapacity(input) {
      await postJson('/api/partner/tonight/capacity', {
        venue_id: input.venueId,
        round_id: input.roundId,
        activity_id: input.activityId,
        venue_snapshot_id: input.venueSnapshotId,
        team_capacity: input.teamCapacity,
        max_team_headcount: input.maxTeamHeadcount,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('capacity'),
      })
      return load()
    },
    async acceptTeam(input) {
      await postJson('/api/partner/tonight/accept', {
        venue_id: input.venueId,
        round_id: input.roundId,
        team_id: input.teamId,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('accept'),
      })
      return load()
    },
    async confirmAttendance(input) {
      await postJson('/api/partner/tonight/service', {
        venue_id: input.venueId,
        round_id: input.roundId,
        team_id: input.teamId,
        confirmed_attendee_count: input.confirmedAttendeeCount,
        service_completed_at: new Date().toISOString(),
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('service'),
      })
      return load()
    },
    async updateArrivalHelp(input) {
      await postJson('/api/partner/tonight/arrival-help', {
        venue_id: input.venueId,
        request_id: input.requestId,
        action: input.action,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('partner_arrival_help'),
      })
      return load()
    },
  }
}

function mapAdminRound(value: unknown): AdminRoundView {
  const row = asRecord(value)
  return {
    ...mapRound(row),
    applicationCount: num(row.application_count),
    maleApplicationCount: num(row.male_application_count),
    femaleApplicationCount: num(row.female_application_count),
    waitlistedCount: num(row.waitlisted_count),
    settlementExceptionCount: num(row.settlement_exception_count),
  }
}

function mapAdminTeam(value: unknown): AdminTeamSummary {
  const row = asRecord(value)
  return {
    id: str(row.summary_team_id),
    teamNumber: num(row.summary_team_number),
    code: str(row.summary_team_code),
    status: str(row.summary_team_status),
    activityTitle: str(row.summary_activity_title),
    venueName: nullableString(row.summary_venue_name),
    memberCount: num(row.summary_member_count),
    maleCount: num(row.summary_male_count),
    femaleCount: num(row.summary_female_count),
    paidCount: num(row.summary_paid_count),
    arrivedCount: num(row.summary_arrived_count),
    confirmedCount: nullableNumber(row.summary_confirmed_count),
    openReportCount: num(row.summary_open_report_count),
  }
}

function emptyFinancialHealth(): AdminTonightData['financialHealth'] {
  return {
    depositDispositionActiveCount: 0,
    depositDeadLetterCount: 0,
    oldestDepositDispositionActiveAt: null,
    settlementActiveCount: 0,
    settlementDeadLetterCount: 0,
    oldestSettlementActiveAt: null,
    refundActiveCount: 0,
    refundFailedCount: 0,
    oldestRefundActiveAt: null,
    reconciliationActiveCount: 0,
    reconciliationFailedCount: 0,
    oldestReconciliationActiveAt: null,
    notificationActiveCount: 0,
    notificationFailedCount: 0,
    oldestNotificationActiveAt: null,
    pushActiveCount: 0,
    pushFailedCount: 0,
    oldestPushActiveAt: null,
    jobs: [],
  }
}

function mapFinancialHealth(value: unknown): AdminTonightData['financialHealth'] {
  const row = asRecord(value)
  return {
    depositDispositionActiveCount: num(row.deposit_disposition_active_count),
    depositDeadLetterCount: num(row.deposit_dead_letter_count),
    oldestDepositDispositionActiveAt: nullableString(row.oldest_deposit_disposition_active_at),
    settlementActiveCount: num(row.settlement_active_count),
    settlementDeadLetterCount: num(row.settlement_dead_letter_count),
    oldestSettlementActiveAt: nullableString(row.oldest_settlement_active_at),
    refundActiveCount: num(row.refund_active_count),
    refundFailedCount: num(row.refund_failed_count),
    oldestRefundActiveAt: nullableString(row.oldest_refund_active_at),
    reconciliationActiveCount: num(row.reconciliation_active_count),
    reconciliationFailedCount: num(row.reconciliation_failed_count),
    oldestReconciliationActiveAt: nullableString(row.oldest_reconciliation_active_at),
    notificationActiveCount: num(row.notification_active_count),
    notificationFailedCount: num(row.notification_failed_count),
    oldestNotificationActiveAt: nullableString(row.oldest_notification_active_at),
    pushActiveCount: num(row.push_active_count),
    pushFailedCount: num(row.push_failed_count),
    oldestPushActiveAt: nullableString(row.oldest_push_active_at),
    jobs: asArray(row.jobs).flatMap((value) => {
      const item = asRecord(value)
      const kind = str(item.job_kind)
      if (kind !== 'deposit_disposition' && kind !== 'settlement') return []
      return [{
        kind,
        id: str(item.job_id),
        revision: num(item.job_revision),
        teamId: str(item.team_id),
        teamCode: str(item.team_code),
        status: str(item.job_status),
        attemptCount: num(item.attempt_count),
        lastErrorCode: nullableString(item.last_error_code),
        createdAt: str(item.created_at),
        updatedAt: str(item.updated_at),
      }]
    }),
  }
}

function mapAllocatorFailures(value: unknown): AdminTonightData['allocationFailures'] {
  return asArray(value).flatMap((entry) => {
    const row = asRecord(entry)
    const status = str(row.status)
    if (status !== 'open' && status !== 'resolved') return []
    const roundId = str(row.round_id)
    const attemptedAt = str(row.attempted_at)
    const errorCode = str(row.error_code)
    if (!roundId || !attemptedAt || !errorCode) return []
    return [{
      roundId,
      lowerBoundTeamCount: num(row.lower_bound_team_count),
      upperBoundTeamCount: num(row.upper_bound_team_count),
      applicantCount: num(row.applicant_count),
      attemptedAt,
      errorCode,
      status,
      revision: num(row.revision),
    }]
  })
}

function mapException(value: unknown, detailLoaded = false): AdminExceptionView | null {
  const row = asRecord(value)
  const rawKind = str(row.exception_kind)
  const kind = (
    rawKind === 'missing_arrival'
    || rawKind === 'active_report'
    || rawKind === 'refund_dead_letter'
    || rawKind === 'headcount_mismatch'
    || rawKind === 'settlement_finalize_pending'
    || rawKind === 'deposit_manual_review'
    || rawKind === 'deposit_reconciliation_failed'
    || rawKind === 'service_confirmation_missing'
  ) ? rawKind : null
  if (!kind) return null
  const contactException = kind === 'missing_arrival'
    || kind === 'active_report'
    || kind === 'deposit_manual_review'
    || kind === 'deposit_reconciliation_failed'
  const refundRevision = nullableNumber(row.refund_request_revision) ?? nullableNumber(row.refund_revision)
  return {
    key: str(row.exception_key),
    detailLoaded,
    kind,
    teamId: str(row.exception_team_id),
    teamCode: str(row.exception_team_code),
    subjectUserId: null,
    subjectName: null,
    subjectPhone: null,
    reporterUserId: null,
    reporterName: null,
    reporterPhone: null,
    businessContactUserId: contactException ? nullableString(row.contact_user_id) : null,
    businessContactRole: contactException && (row.contact_role === 'subject' || row.contact_role === 'reporter')
      ? row.contact_role
      : null,
    businessContactPhoneMasked: contactException ? nullableString(row.contact_phone_masked) : null,
    reportId: kind === 'active_report' ? nullableString(row.report_id) : null,
    category: kind === 'active_report' ? nullableString(row.report_category) : null,
    refundRequestId: kind === 'refund_dead_letter' ? nullableString(row.refund_request_id) : null,
    refundRevision: kind === 'refund_dead_letter' ? refundRevision : null,
    reconciliationJobId: nullableString(row.reconciliation_job_id),
    reconciliationRevision: nullableNumber(row.reconciliation_revision),
    manualDepositId: nullableString(row.manual_deposit_id),
    manualDepositRevision: nullableNumber(row.manual_deposit_revision),
    manualForfeitPolicyApproved: false,
    status: str(row.exception_status),
    serviceAttemptId: nullableString(row.service_attempt_id),
    reportedAttendeeCount: nullableNumber(row.reported_attendee_count),
    observedArrivedCount: nullableNumber(row.observed_arrived_count),
    serviceConfirmationRevision: nullableNumber(row.service_confirmation_revision),
    callStatus: nullableString(row.call_status) ?? undefined,
  }
}

export function createLiveAdminTonightAdapter(): AdminTonightAdapter {
  let currentRoundId = ''
  let currentRoundCursor: string | null = null
  let currentAfterTeamNumber: number | null = null
  let currentExceptionRoundId = ''
  let currentAfterExceptionKey: string | null = null
  let currentFinancialCursor: string | null = null
  let currentAllocationFailureCursor: string | null = null
  let currentExceptions: AdminExceptionView[] = []
  let currentExceptionPage: AdminTonightData['exceptionPage'] | null = null
  const load = async (input?: {
    roundId?: string
    roundCursor?: string | null
    afterTeamNumber?: number | null
    afterExceptionKey?: string | null
    financialCursor?: string | null
    allocationFailureCursor?: string | null
  }): Promise<AdminTonightData> => {
    if (input?.roundCursor !== undefined) currentRoundCursor = input.roundCursor
    const roundCursorQuery = currentRoundCursor
      ? `&cursor=${encodeURIComponent(currentRoundCursor)}`
      : ''
    const roundsResponse = await requestJson(`/api/admin/tonight/rounds?limit=50${roundCursorQuery}`)
    const rounds = asArray(roundsResponse.rounds).map(mapAdminRound)
    const requestedRoundId = input?.roundId && rounds.some((round) => round.id === input.roundId)
      ? input.roundId
      : null
    const retainedRoundId = rounds.some((round) => round.id === currentRoundId)
      ? currentRoundId
      : null
    const activeRoundId = requestedRoundId || retainedRoundId || rounds[0]?.id || null
    const roundChanged = Boolean(activeRoundId && activeRoundId !== currentRoundId)
    if (roundChanged && input?.afterTeamNumber === undefined) {
      currentAfterTeamNumber = null
    }
    if (roundChanged) {
      currentAfterExceptionKey = null
      currentFinancialCursor = null
      currentAllocationFailureCursor = null
      currentExceptionRoundId = ''
      currentExceptions = []
      currentExceptionPage = null
    }
    currentRoundId = activeRoundId ?? ''
    if (input?.afterTeamNumber !== undefined) currentAfterTeamNumber = input.afterTeamNumber
    if (input?.afterExceptionKey !== undefined) currentAfterExceptionKey = input.afterExceptionKey
    if (input?.financialCursor !== undefined) currentFinancialCursor = input.financialCursor
    if (input?.allocationFailureCursor !== undefined) {
      currentAllocationFailureCursor = input.allocationFailureCursor
    }
    if (!activeRoundId) return {
      rounds,
      activeRoundId: null,
      teams: [],
      exceptions: [],
      roundPage: {
        cursor: currentRoundCursor,
        nextCursor: nullableString(roundsResponse.next_cursor),
        limit: 50,
      },
      teamPage: { afterTeamNumber: null, nextAfterTeamNumber: null, limit: 50 },
      exceptionPage: {
        afterExceptionKey: null,
        nextAfterExceptionKey: null,
        limit: 50,
        totalCount: 0,
        counts: {},
      },
      financialHealth: emptyFinancialHealth(),
      financialJobPage: { cursor: null, nextCursor: null, limit: 50 },
      allocationFailures: [],
      allocationFailurePage: { cursor: null, nextCursor: null, limit: 50 },
      arrivalHelpRequests: [],
    }
    const teamCursorQuery = currentAfterTeamNumber === null
      ? ''
      : `&after_team_number=${encodeURIComponent(String(currentAfterTeamNumber))}`
    const shouldLoadExceptions = activeRoundId !== currentExceptionRoundId
      || input?.afterExceptionKey !== undefined
      || currentExceptionPage === null
    const exceptionCursorQuery = currentAfterExceptionKey === null
      ? ''
      : `&after_exception_key=${encodeURIComponent(currentAfterExceptionKey)}`
    const financialCursorQuery = currentFinancialCursor === null
      ? ''
      : `&cursor=${encodeURIComponent(currentFinancialCursor)}`
    const allocationFailureCursorQuery = currentAllocationFailureCursor === null
      ? ''
      : `&cursor=${encodeURIComponent(currentAllocationFailureCursor)}`
    const [summary, exceptionsPayload, financialPayload, allocationFailurePayload, arrivalHelpPayload] = await Promise.all([
      requestJson(`/api/admin/tonight/summary?round_id=${encodeURIComponent(activeRoundId)}${teamCursorQuery}`),
      shouldLoadExceptions
        ? requestJson(`/api/admin/tonight/exceptions?round_id=${encodeURIComponent(activeRoundId)}${exceptionCursorQuery}`)
        : Promise.resolve(null),
      requestJson(`/api/admin/tonight/financial-health?round_id=${encodeURIComponent(activeRoundId)}&limit=50${financialCursorQuery}`),
      requestJson(`/api/admin/tonight/allocation-failures?round_id=${encodeURIComponent(activeRoundId)}&limit=50${allocationFailureCursorQuery}`),
      requestJson(`/api/admin/tonight/arrival-help?round_id=${encodeURIComponent(activeRoundId)}`),
    ])
    if (exceptionsPayload) {
      currentExceptions = asArray(exceptionsPayload.exceptions)
        .map((value) => mapException(value, false))
        .filter((exception): exception is AdminExceptionView => exception !== null)
      currentExceptionPage = {
        afterExceptionKey: currentAfterExceptionKey,
        nextAfterExceptionKey: nullableString(exceptionsPayload.next_after_exception_key),
        limit: 50,
        totalCount: num(exceptionsPayload.total_count),
        counts: Object.fromEntries(
          Object.entries(asRecord(exceptionsPayload.counts))
            .map(([key, value]) => [key, num(value)]),
        ),
      }
      currentExceptionRoundId = activeRoundId
    }
    return {
      rounds,
      activeRoundId,
      teams: asArray(summary.teams).map(mapAdminTeam),
      exceptions: currentExceptions,
      roundPage: {
        cursor: currentRoundCursor,
        nextCursor: nullableString(roundsResponse.next_cursor),
        limit: 50,
      },
      teamPage: {
        afterTeamNumber: currentAfterTeamNumber,
        nextAfterTeamNumber: nullableNumber(summary.next_after_team_number),
        limit: 50,
      },
      exceptionPage: currentExceptionPage ?? {
        afterExceptionKey: currentAfterExceptionKey,
        nextAfterExceptionKey: null,
        limit: 50,
        totalCount: 0,
        counts: {},
      },
      financialHealth: mapFinancialHealth(asRecord(financialPayload).health),
      financialJobPage: {
        cursor: currentFinancialCursor,
        nextCursor: nullableString(financialPayload.next_cursor),
        limit: 50,
      },
      allocationFailures: mapAllocatorFailures(allocationFailurePayload.failures),
      allocationFailurePage: {
        cursor: currentAllocationFailureCursor,
        nextCursor: nullableString(allocationFailurePayload.next_cursor),
        limit: 50,
      },
      arrivalHelpRequests: asArray(arrivalHelpPayload.arrival_help)
        .map((value) => mapArrivalHelp(value))
        .filter((value): value is TonightArrivalHelpView => value !== null),
    }
  }
  return {
    load,
    async loadExceptionDetail(input) {
      const payload = await requestJson(
        `/api/admin/tonight/exceptions/detail?round_id=${encodeURIComponent(input.roundId)}&exception_key=${encodeURIComponent(input.exceptionKey)}`,
      )
      const detail = mapException(payload.exception, true)
      if (!detail) throw new Error('선택한 예외 상세를 불러오지 못했어요.')
      currentExceptions = currentExceptions.map((exception) =>
        exception.key === input.exceptionKey ? detail : exception)
      return detail
    },
    async recordCall(input) {
      await postJson('/api/admin/tonight/calls', {
        team_id: input.teamId,
        subject_user_id: input.subjectUserId,
        outcome: input.outcome,
        idempotency_key: idempotencyKey('call'),
      })
      currentExceptions = currentExceptions.map((exception) =>
        exception.teamId === input.teamId
          && (exception.businessContactUserId ?? exception.subjectUserId) === input.subjectUserId
          ? { ...exception, callStatus: input.outcome }
          : exception)
      return load({ roundId: currentRoundId, afterTeamNumber: currentAfterTeamNumber })
    },
    async updateArrivalHelp(input) {
      await postJson('/api/admin/tonight/arrival-help', {
        request_id: input.requestId,
        action: input.action,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('admin_arrival_help'),
      })
      return load({ roundId: currentRoundId, afterTeamNumber: currentAfterTeamNumber })
    },
  }
}

function mapDiagnostic(value: unknown): SuperAdminMemberView {
  const row = asRecord(value)
  const automaticScore = num(row.diagnostic_automatic_appearance_score, num(row.diagnostic_appearance_score))
  const finalScore = num(row.diagnostic_effective_appearance_score, num(row.diagnostic_appearance_score))
  return {
    teamRevision: num(row.diagnostic_team_revision),
    applicationId: str(row.diagnostic_application_id),
    userId: str(row.diagnostic_user_id),
    name: str(row.diagnostic_display_name, '이름 미등록'),
    phone: str(row.diagnostic_phone),
    photoUrls: asArray(row.photo_urls).map((url) => str(url)).filter(Boolean),
    age: num(row.diagnostic_age_years),
    gender: str(row.diagnostic_gender_code) === 'female' ? 'female' : 'male',
    automaticScore,
    adjustment: num(row.diagnostic_appearance_adjustment, finalScore - automaticScore),
    finalScore,
    featureRevision: num(row.diagnostic_feature_revision),
    bundleId: nullableString(row.diagnostic_bundle_id),
    seatNumber: num(row.diagnostic_seat_number),
    depositStatus: str(row.diagnostic_deposit_status),
    attendanceStatus: str(row.diagnostic_attendance_status, 'pending'),
    attendanceRevision: num(row.diagnostic_attendance_revision),
  }
}

function shortenedReference(value: unknown, noun: string): string {
  const raw = str(value)
  return raw ? `${noun} · …${raw.slice(-4)}` : `${noun} 정보 확인 필요`
}

function accessMemberships(payload: UnknownRecord, group: 'admin' | 'partner' | 'market'): AccessMembershipView[] {
  return asArray(payload.memberships).map((value) => {
    const row = asRecord(value)
    const accountLabel = str(row.display_name)
      ? [str(row.display_name), str(row.email_hint)].filter(Boolean).join(' · ')
      : shortenedReference(row.user_id, '가입 계정')
    if (group === 'admin') {
      const role = str(row.role) === 'super_admin' ? 'super_admin' : 'admin'
      return { id: str(row.user_id), detailLoaded: true, revision: num(row.revision), label: accountLabel, role, marketCode: null, venueName: null, status: row.is_active === false ? 'revoked' : 'active' }
    }
    if (group === 'partner') {
      return {
        id: str(row.membership_id, str(row.id)),
        detailLoaded: Boolean(str(row.display_name) || str(row.email_hint) || str(row.venue_name)),
        revision: num(row.revision),
        label: accountLabel,
        role: 'partner',
        marketCode: null,
        venueName: str(row.venue_name) || shortenedReference(row.venue_id, '연결 업장'),
        status: nullableString(row.revoked_at) ? 'revoked' : 'active',
      }
    }
    return { id: str(row.membership_id, str(row.id)), detailLoaded: Boolean(str(row.display_name) || str(row.email_hint)), revision: num(row.membership_revision, num(row.revision)), label: accountLabel, role: 'user', marketCode: str(row.market_code, 'PNU'), venueName: null, status: nullableString(row.revoked_at) ? 'revoked' : 'active' }
  })
}

export function createLiveSuperAdminTonightAdapter(): SuperAdminTonightAdapter {
  const adminAdapter = createLiveAdminTonightAdapter()
  let currentRoundId = ''
  let currentTeamId = ''
  let currentAfterTeamNumber: number | null = null
  let currentAfterExceptionKey: string | null = null
  let currentFinancialCursor: string | null = null
  let currentAllocationFailureCursor: string | null = null
  let currentAuditCursor: string | null = null
  let currentNotificationFailureCursor: string | null = null
  let cachedVenueSnapshots: PublicPlaceDto[] = []
  let accessLoaded = false
  let cachedAdminMemberships: AccessMembershipView[] = []
  let cachedPartnerMemberships: AccessMembershipView[] = []
  let cachedMarketMemberships: AccessMembershipView[] = []
  let cachedMemberships: AccessMembershipView[] = []
  let marketMembershipPage: SuperAdminTonightData['marketMembershipPage'] = {
    afterMembershipId: null,
    nextAfterMembershipId: null,
    limit: 50,
    userId: null,
  }
  let partnerMembershipPage: SuperAdminTonightData['partnerMembershipPage'] = {
    afterMembershipId: null,
    nextAfterMembershipId: null,
    limit: 50,
    userId: null,
    venueId: null,
  }

  const fetchVenueSnapshots = async (venueId: string): Promise<PublicPlaceDto[]> => {
    const payload = await requestJson(
      `/api/admin/super-admin/tonight/venues/snapshot?venue_id=${encodeURIComponent(venueId)}`,
    )
    return asArray(payload.snapshots).map((value) => projectVenueSnapshotRow(asRecord(value)))
  }

  const load = async (input?: {
    roundId?: string
    roundCursor?: string | null
    teamId?: string
    afterTeamNumber?: number | null
    afterExceptionKey?: string | null
    financialCursor?: string | null
    allocationFailureCursor?: string | null
    auditCursor?: string | null
    notificationFailureCursor?: string | null
  }): Promise<SuperAdminTonightData> => {
    const previousRoundId = currentRoundId
    if (input?.roundId && input.roundId !== currentRoundId && input.afterTeamNumber === undefined) {
      currentAfterTeamNumber = null
      currentAfterExceptionKey = null
      currentFinancialCursor = null
      currentAllocationFailureCursor = null
      currentAuditCursor = null
      currentNotificationFailureCursor = null
    }
    if (input?.afterTeamNumber !== undefined) currentAfterTeamNumber = input.afterTeamNumber
    if (input?.afterExceptionKey !== undefined) currentAfterExceptionKey = input.afterExceptionKey
    if (input?.financialCursor !== undefined) currentFinancialCursor = input.financialCursor
    if (input?.allocationFailureCursor !== undefined) {
      currentAllocationFailureCursor = input.allocationFailureCursor
    }
    if (input?.auditCursor !== undefined) currentAuditCursor = input.auditCursor
    if (input?.notificationFailureCursor !== undefined) {
      currentNotificationFailureCursor = input.notificationFailureCursor
    }
    const requestedRoundId = input?.roundId || currentRoundId || undefined
    const baseAdmin = await adminAdapter.load({
      roundId: requestedRoundId,
      roundCursor: input?.roundCursor,
      afterTeamNumber: currentAfterTeamNumber,
      afterExceptionKey: input?.afterExceptionKey,
      financialCursor: currentFinancialCursor,
      allocationFailureCursor: currentAllocationFailureCursor,
    })
    const databaseGatePayload = await requestJson(
      '/api/admin/config?key=tonight_applications_open',
    )
    const databaseApplicationsOpen = readDatabaseApplicationsOpen(databaseGatePayload)
    currentRoundId = baseAdmin.activeRoundId ?? ''
    const pageOrRoundChanged = previousRoundId !== currentRoundId || input?.afterTeamNumber !== undefined
    if (input?.teamId) currentTeamId = input.teamId
    else if (pageOrRoundChanged) currentTeamId = ''
    if (currentTeamId && !baseAdmin.teams.some((team) => team.id === currentTeamId)) currentTeamId = ''

    // Sensitive phone/photo/score diagnostics are fetched only after an
    // explicit team selection. Never fan this request out across a page.
    const diagnosticTeamId = input?.teamId || currentTeamId
    const activePayload = diagnosticTeamId
      ? await requestJson(`/api/admin/super-admin/tonight/diagnostics?team_id=${encodeURIComponent(diagnosticTeamId)}`)
        .then((payload) => ({ rows: asArray(payload.diagnostics).map(mapDiagnostic) }))
      : undefined
    const bundleCursorQuery = currentAfterTeamNumber === null
      ? ''
      : `&after_team_number=${encodeURIComponent(String(currentAfterTeamNumber))}`
    const bundlePayload = currentRoundId
      ? await requestJson(`/api/admin/super-admin/tonight/bundles?round_id=${encodeURIComponent(currentRoundId)}${bundleCursorQuery}`)
      : { bundles: [] }
    const bundlesByTeam = new Map<string, {
      teamId: string
      teamCode: string
      teamRevision: number
      bundles: { bundleId: string; memberCount: number }[]
    }>()
    for (const value of asArray(bundlePayload.bundles)) {
      const row = asRecord(value)
      const teamId = str(row.bundle_team_id)
      const bundleId = str(row.bundle_id)
      if (!teamId || !bundleId) continue
      const existing = bundlesByTeam.get(teamId) ?? {
        teamId,
        teamCode: str(row.bundle_team_code),
        teamRevision: num(row.bundle_team_revision),
        bundles: [],
      }
      existing.bundles.push({
        bundleId,
        memberCount: num(row.bundle_member_count),
      })
      bundlesByTeam.set(teamId, existing)
    }
    const teamBundles = [...bundlesByTeam.values()]
    const auditCursorQuery = currentAuditCursor
      ? `&cursor=${encodeURIComponent(currentAuditCursor)}`
      : ''
    const auditPayload = currentRoundId
      ? await requestJson(`/api/admin/super-admin/tonight/audit?round_id=${encodeURIComponent(currentRoundId)}&limit=50${auditCursorQuery}`)
      : { audit: [], next_cursor: null }
    const notificationFailureQuery = currentRoundId
      ? [
        `round_id=${encodeURIComponent(currentRoundId)}`,
        'limit=50',
        ...(currentNotificationFailureCursor
          ? [`cursor=${encodeURIComponent(currentNotificationFailureCursor)}`]
          : []),
      ].join('&')
      : ''
    const notificationPayload = notificationFailureQuery
      ? await requestJson(`/api/admin/super-admin/tonight/notifications/failures?${notificationFailureQuery}`)
      : { failures: [], next_cursor: null }
    const admin = baseAdmin

    return {
      admin,
      databaseApplicationsOpen,
      activeTeamId: currentTeamId || null,
      members: activePayload?.rows ?? [],
      teamBundles,
      memberships: cachedMemberships,
      accessLoaded,
      marketMembershipPage,
      partnerMembershipPage,
      venueSnapshots: cachedVenueSnapshots,
      notificationFailures: asArray(notificationPayload.failures).map((value) => {
        const row = asRecord(value)
        return {
          kind: str(row.failure_kind) === 'push' ? 'push' as const : 'in_app' as const,
          id: str(row.failure_id),
          revision: num(row.failure_revision),
          roundId: str(row.round_id),
          teamId: nullableString(row.team_id),
          eventType: str(row.event_type),
          recipientRef: str(row.recipient_ref),
          teamRef: nullableString(row.team_ref),
          failureCode: str(row.failure_code),
          attemptCount: num(row.attempt_count),
          failedAt: str(row.failed_at),
          resubscribeRequired: Boolean(row.resubscribe_required),
        }
      }),
      notificationFailurePage: {
        cursor: currentNotificationFailureCursor,
        nextCursor: nullableString(notificationPayload.next_cursor),
        limit: 50,
      },
      audit: asArray(auditPayload.audit).map((value) => {
        const row = asRecord(value)
        return {
          id: str(row.audit_id),
          actor: [str(row.audit_actor_kind), str(row.audit_actor_user_id)].filter(Boolean).join(' · '),
          at: str(row.audit_occurred_at),
          action: str(row.audit_action),
          before: JSON.stringify(row.audit_before_state ?? null),
          after: JSON.stringify(row.audit_after_state ?? null),
        }
      }),
      auditPage: {
        cursor: currentAuditCursor,
        nextCursor: nullableString(auditPayload.next_cursor),
        limit: 50,
      },
    }
  }

  return {
    load,
    loadExceptionDetail: (input) => adminAdapter.loadExceptionDetail(input),
    async setDatabaseApplicationsOpen(input) {
      const response = await postJson('/api/admin/config', {
        key: 'tonight_applications_open',
        value: input.value,
      })
      const savedValue = readDatabaseApplicationsOpen(response)
      if (savedValue !== input.value) {
        throw new Error('DB 신청 Gate 변경을 확인하지 못했어요.')
      }
      return load({ roundId: currentRoundId, teamId: currentTeamId })
    },
    async loadAccess(input) {
      const afterMembershipId = input?.afterMembershipId ?? null
      const userId = input?.userId ?? null
      const partnerAfterMembershipId = input?.partnerAfterMembershipId ?? null
      const partnerUserId = input?.partnerUserId ?? null
      const partnerVenueId = input?.partnerVenueId ?? null
      const refreshAll = !accessLoaded
      const refreshMarket = refreshAll
        || input?.afterMembershipId !== undefined
        || input?.userId !== undefined
      const refreshPartner = refreshAll
        || input?.partnerAfterMembershipId !== undefined
        || input?.partnerUserId !== undefined
        || input?.partnerVenueId !== undefined
      const marketQuery = [
        'market_code=PNU',
        ...(afterMembershipId ? [`after_membership_id=${encodeURIComponent(afterMembershipId)}`] : []),
        ...(userId ? [`user_id=${encodeURIComponent(userId)}`] : []),
      ].join('&')
      const partnerQuery = [
        'include_revoked=true',
        ...(partnerAfterMembershipId ? [`after_membership_id=${encodeURIComponent(partnerAfterMembershipId)}`] : []),
        ...(partnerUserId ? [`user_id=${encodeURIComponent(partnerUserId)}`] : []),
        ...(partnerVenueId ? [`venue_id=${encodeURIComponent(partnerVenueId)}`] : []),
      ].join('&')
      const [admins, partners, markets] = await Promise.all([
        refreshAll
          ? requestJson('/api/admin/super-admin/tonight/access/admin')
          : Promise.resolve(null),
        refreshPartner
          ? requestJson(`/api/admin/super-admin/tonight/access/partner?${partnerQuery}`)
          : Promise.resolve(null),
        refreshMarket
          ? requestJson(`/api/admin/super-admin/tonight/access/market?${marketQuery}`)
          : Promise.resolve(null),
      ])
      if (admins) cachedAdminMemberships = accessMemberships(admins, 'admin')
      if (partners) cachedPartnerMemberships = accessMemberships(partners, 'partner')
      if (markets) cachedMarketMemberships = accessMemberships(markets, 'market')
      cachedMemberships = [
        ...cachedAdminMemberships,
        ...cachedPartnerMemberships,
        ...cachedMarketMemberships,
      ]
      accessLoaded = true
      if (markets) {
        marketMembershipPage = {
          afterMembershipId,
          nextAfterMembershipId: nullableString(markets.next_after_membership_id),
          limit: 50,
          userId,
        }
      }
      if (partners) {
        partnerMembershipPage = {
          afterMembershipId: partnerAfterMembershipId,
          nextAfterMembershipId: nullableString(partners.next_after_membership_id),
          limit: 50,
          userId: partnerUserId,
          venueId: partnerVenueId,
        }
      }
      return load({ roundId: currentRoundId, teamId: currentTeamId })
    },
    async loadAccessDetail(input) {
      const group = input.role === 'partner' ? 'partner' : 'market'
      const detailPath = input.role === 'partner'
        ? '/api/admin/super-admin/tonight/access/partner/detail'
        : '/api/admin/super-admin/tonight/access/market/detail'
      const payload = await requestJson(
        `${detailPath}?membership_id=${encodeURIComponent(input.membershipId)}`,
      )
      const detail = accessMemberships({ memberships: [payload.membership] }, group)[0]
      if (!detail) throw new Error('선택한 사용자 자격을 찾지 못했어요.')
      if (input.role === 'partner') {
        cachedPartnerMemberships = cachedPartnerMemberships.map((membership) =>
          membership.id === input.membershipId ? detail : membership)
      } else {
        cachedMarketMemberships = cachedMarketMemberships.map((membership) =>
          membership.id === input.membershipId ? detail : membership)
      }
      cachedMemberships = [
        ...cachedAdminMemberships,
        ...cachedPartnerMemberships,
        ...cachedMarketMemberships,
      ]
      return detail
    },
    async loadVenueSnapshots(input) {
      cachedVenueSnapshots = await fetchVenueSnapshots(input.venueId)
      return cachedVenueSnapshots
    },
    async searchDirectory(query) {
      const response = await requestJson(`/api/admin/super-admin/tonight/directory?q=${encodeURIComponent(query)}`)
      return {
        accounts: asArray(response.users).map((value) => {
          const row = asRecord(value)
          return {
            userId: str(row.user_id),
            name: str(row.display_name, '이름 미등록'),
            email: nullableString(row.email_hint),
          }
        }),
        venues: asArray(response.venues).map((value) => {
          const row = asRecord(value)
          return {
            venueId: str(row.id),
            name: str(row.name, '이름 미등록 업장'),
            address: nullableString(row.address),
          }
        }),
      }
    },
    async adjustAppearance(input) {
      await postJson('/api/admin/super-admin/tonight/appearance', {
        application_id: input.applicationId,
        appearance_score: input.score,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('appearance'),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId })
    },
    async swapBundles(input) {
      await postJson('/api/admin/super-admin/tonight/swap', {
        team_a_id: input.teamAId,
        bundle_a_id: input.bundleAId,
        expected_team_a_revision: input.expectedTeamARevision,
        team_b_id: input.teamBId,
        bundle_b_id: input.bundleBId,
        expected_team_b_revision: input.expectedTeamBRevision,
        idempotency_key: idempotencyKey('swap'),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId })
    },
    async updateAttendance(input) {
      await postJson('/api/admin/super-admin/tonight/attendance', {
        team_id: input.teamId,
        user_id: input.userId,
        status: input.status,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('attendance'),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId })
    },
    async recoverServiceConfirmation(input) {
      await postJson('/api/admin/super-admin/tonight/service-recovery', {
        team_id: input.teamId,
        attempt_id: input.attemptId,
        expected_revision: input.expectedRevision,
        idempotency_key: idempotencyKey('service_recovery'),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId, afterExceptionKey: currentAfterExceptionKey })
    },
    async retryRefund(input) {
      await postJson('/api/admin/super-admin/tonight/refunds/retry', {
        requestId: input.requestId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: idempotencyKey('refund_retry'),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId, afterExceptionKey: currentAfterExceptionKey })
    },
    async retryReconciliation(input) {
      await postJson('/api/admin/super-admin/tonight/reconciliations/retry', {
        jobId: input.jobId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: idempotencyKey('reconciliation_retry'),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId, afterExceptionKey: currentAfterExceptionKey })
    },
    async resolveManualDeposit(input) {
      await postJson('/api/admin/super-admin/tonight/deposits/manual-review', {
        depositId: input.depositId,
        decision: input.decision,
        expectedRevision: input.expectedRevision,
        idempotencyKey: idempotencyKey(`manual_deposit_${input.decision}`),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId, afterExceptionKey: currentAfterExceptionKey })
    },
    async retryFinancialJob(input) {
      await postJson('/api/admin/super-admin/tonight/financial-jobs/retry', {
        jobKind: input.jobKind,
        jobId: input.jobId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: idempotencyKey(`financial_${input.jobKind}`),
      })
      return load({ roundId: currentRoundId, teamId: currentTeamId, afterExceptionKey: currentAfterExceptionKey })
    },
    async retryNotificationFailure(input) {
      await postJson('/api/admin/super-admin/tonight/notifications/retry', {
        failureKind: input.failureKind,
        failureId: input.failureId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: idempotencyKey(`notification_${input.failureKind}`),
      })
      return load({
        roundId: currentRoundId,
        teamId: currentTeamId,
        afterExceptionKey: currentAfterExceptionKey,
        notificationFailureCursor: currentNotificationFailureCursor,
      })
    },
    async updateMembership(input) {
      if (input.role === 'admin' || input.role === 'super_admin') {
        const adminAccess = await requestJson(`/api/admin/super-admin/tonight/access/admin?user_id=${encodeURIComponent(input.subject)}`)
        const rows = asArray(adminAccess.memberships).map(asRecord)
        const current = rows.find((row) => str(row.user_id) === input.subject)
        const currentRevision = nullableNumber(current?.revision)
        const currentActive = current?.is_active === true
        if (currentRevision === null) {
          throw new Error('운영자 권한의 최신 revision을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.')
        }
        if (input.action === 'revoke' && (!currentActive || currentRevision < 1)) {
          throw new Error('운영자 권한의 최신 revision을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.')
        }
        await (input.action === 'grant'
          ? postJson('/api/admin/super-admin/tonight/access/admin', {
            user_id: input.subject,
            role: input.role,
            expected_revision: currentRevision,
            idempotency_key: idempotencyKey('admin_grant'),
          })
          : deleteJson('/api/admin/super-admin/tonight/access/admin', {
            user_id: input.subject,
            expected_revision: currentRevision,
            idempotency_key: idempotencyKey('admin_revoke'),
          }))
      } else if (input.role === 'partner') {
        if (input.action === 'grant') {
          if (!input.venueId) {
            throw new Error('권한을 연결할 업장을 선택해 주세요.')
          }
          const partnerAccess = await requestJson(
            `/api/admin/super-admin/tonight/access/partner?user_id=${encodeURIComponent(input.subject)}&venue_id=${encodeURIComponent(input.venueId)}`,
          )
          const state = asRecord(partnerAccess.membership_state)
          const currentRevision = nullableNumber(state.revision)
          const currentActive = state.is_active === true
          if (
            str(state.user_id) !== input.subject
            || str(state.venue_id) !== input.venueId
            || currentRevision === null
            || currentRevision < 0
            || (currentActive && !nullableString(state.membership_id))
          ) {
            throw new Error('업장 권한의 최신 revision을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.')
          }
          await postJson('/api/admin/super-admin/tonight/access/partner', {
            user_id: input.subject,
            venue_id: input.venueId,
            role: 'owner',
            expected_revision: currentRevision,
            idempotency_key: idempotencyKey('partner_grant'),
          })
        } else {
          const current = cachedPartnerMemberships.find((membership) => membership.id === input.subject)
          const partnerRevision = current?.revision ?? null
          if (partnerRevision === null || partnerRevision < 1) {
            throw new Error('업장 권한의 최신 revision을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.')
          }
          await deleteJson('/api/admin/super-admin/tonight/access/partner', {
            membership_id: input.subject,
            expected_revision: partnerRevision,
            idempotency_key: idempotencyKey('partner_revoke'),
          })
        }
      } else {
        const membership = cachedMemberships.find((item) => item.id === input.subject)
        await (input.action === 'grant'
          ? postJson('/api/admin/super-admin/tonight/access/market', { market_code: input.marketCode ?? 'PNU', user_id: input.subject, idempotency_key: idempotencyKey('market') })
          : deleteJson('/api/admin/super-admin/tonight/access/market', { membership_id: input.subject, expected_revision: membership?.revision ?? 0, idempotency_key: idempotencyKey('market_revoke') }))
      }
      accessLoaded = false
      marketMembershipPage = {
        afterMembershipId: null,
        nextAfterMembershipId: null,
        limit: 50,
        userId: null,
      }
      partnerMembershipPage = {
        afterMembershipId: null,
        nextAfterMembershipId: null,
        limit: 50,
        userId: null,
        venueId: null,
      }
      return this.loadAccess()
    },
    async saveVenueSnapshot(input) {
      const verifiedAt = new Date().toISOString()
      await postJson('/api/admin/super-admin/tonight/venues/snapshot', {
        venue_id: input.venueId,
        latitude: input.latitude,
        longitude: input.longitude,
        address_evidence: 'operator-verified',
        address_verified_at: verifiedAt,
        coordinate_evidence: 'operator-verified',
        coordinates_verified_at: verifiedAt,
      })
      cachedVenueSnapshots = await fetchVenueSnapshots(input.venueId)
      return load({ roundId: currentRoundId, teamId: currentTeamId })
    },
  }
}
