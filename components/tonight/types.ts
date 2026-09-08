import type { PublicPlaceDto } from '@/lib/places/contracts'
import type {
  TONIGHT_DEPOSIT_POLICY_HASH,
  TONIGHT_DEPOSIT_POLICY_VERSION,
} from '@/lib/payments/tonight-deposit-policy'

export type TonightUiMode = 'live' | 'rehearsal'

export type TonightActivityCard = Readonly<{
  id: string
  title: string
  description: string
  imageUrl: string
  imageAlt: string
  durationMinutes: number
  kind: string
}>

export type TonightRoundView = Readonly<{
  id: string
  marketCode: string
  serviceDate: string
  status: string
  signupCloseAt: string
  capacityLockAt: string
  allocationPublishAt: string
  depositDueAt: string
  partnerAcceptanceDueAt: string
  revealAt: string
  arrivalAt: string
  startsAt: string
}>

export type TonightApplicationView = Readonly<{
  id: string
  status: string
  revision: number
  choices: readonly Readonly<{ activityId: string; rank: number }>[]
  bundle: Readonly<{
    id: string
    status: string
    maxSize: number
    memberCount: number
  }> | null
  deposit: Readonly<{
    status: string
    amount: number
    revision: number
    refundStatus: string | null
    refundRevision: number | null
  }> | null
}>

export type TonightJourneyView = Readonly<{
  applicationId: string
  applicationStatus: string
  teamId: string | null
  teamRevision: number | null
  teamCode: string | null
  teamStatus: string | null
  activityTitle: string | null
  canRevealExactVenue: boolean
  attendanceStatus: string | null
  attendanceRevision: number | null
  canMarkArrival: boolean
  place: PublicPlaceDto | null
}>

export type TonightArrivalHelpView = Readonly<{
  requestId: string
  teamId: string
  teamCode: string
  venueName: string | null
  category: 'entrance' | 'team' | 'venue'
  status: 'requested' | 'acknowledged' | 'escalated' | 'resolved' | 'cancelled'
  revision: number
  requestedAt: string
  updatedAt: string
  nextActor: 'participant' | 'partner' | 'operator' | null
  nextAction: string
}>

import type { ParticipationSummary } from '@/lib/participation/summary'

export type UserTonightData = Readonly<{
  round: TonightRoundView
  activities: readonly [TonightActivityCard, TonightActivityCard, TonightActivityCard]
  applicationsOpen: boolean
  participationSummary: ParticipationSummary
  application: TonightApplicationView | null
  journey: TonightJourneyView | null
  arrivalHelpRequest: TonightArrivalHelpView | null
}>

export type UserApplyInput = Readonly<{
  roundId: string
  rankedActivityIds: readonly [string, string, string]
  matchingConsentAccepted: true
  matchingConsentVersion: '2026-09-03'
}>

export interface UserTonightAdapter {
  load(): Promise<UserTonightData>
  apply(input: UserApplyInput): Promise<UserTonightData>
  beginDeposit(input: {
    applicationId: string
    depositPolicyAccepted: true
    depositPolicyVersion: typeof TONIGHT_DEPOSIT_POLICY_VERSION
    depositPolicyHash: typeof TONIGHT_DEPOSIT_POLICY_HASH
  }): Promise<{ redirectUrl?: string }>
  markArrival(input: { teamId: string; expectedRevision: number }): Promise<UserTonightData>
  requestArrivalHelp(input: {
    teamId: string
    category: 'entrance' | 'team' | 'venue'
  }): Promise<UserTonightData>
  cancelArrivalHelp(input: {
    requestId: string
    expectedRevision: number
  }): Promise<UserTonightData>
  report(input: {
    teamId: string
    category: string
    description: string
  }): Promise<{ reportId: string }>
  requestRefund(input: {
    applicationId: string
    expectedDepositRevision: number
  }): Promise<{ refundRequestId: string }>
}

export type PartnerCapacityView = Readonly<{
  id: string
  activityId: string
  activityTitle: string
  teamCapacity: number
  maxTeamHeadcount: 5 | 6
  reservedTeamCount: number
  status: string
  revision: number
}>

export type PartnerTeamView = Readonly<{
  id: string
  code: string
  status: string
  activityTitle: string
  teamRevision: number | null
  memberCount: number
  paidMemberCount: number
  arrivedMemberCount: number
  confirmedAttendeeCount: number | null
  serviceRevision: number | null
  serviceConfirmAfter: string
  canConfirmService: boolean
}>

export type PartnerTonightData = Readonly<{
  round: TonightRoundView
  venueId: string
  venueSnapshotId: string
  venueName: string
  place: PublicPlaceDto
  capacities: readonly PartnerCapacityView[]
  teams: readonly PartnerTeamView[]
  arrivalHelpRequests: readonly TonightArrivalHelpView[]
}>

export interface PartnerTonightAdapter {
  load(): Promise<PartnerTonightData>
  saveCapacity(input: {
    venueId: string
    roundId: string
    activityId: string
    venueSnapshotId: string
    teamCapacity: number
    maxTeamHeadcount: 5 | 6
    expectedRevision: number
  }): Promise<PartnerTonightData>
  acceptTeam(input: {
    venueId: string
    roundId: string
    teamId: string
    expectedRevision: number
  }): Promise<PartnerTonightData>
  confirmAttendance(input: {
    venueId: string
    roundId: string
    teamId: string
    confirmedAttendeeCount: number
    expectedRevision: number
  }): Promise<PartnerTonightData>
  updateArrivalHelp(input: {
    venueId: string
    requestId: string
    action: 'acknowledge' | 'escalate' | 'resolve'
    expectedRevision: number
  }): Promise<PartnerTonightData>
}

export type AdminRoundView = TonightRoundView & Readonly<{
  applicationCount: number
  maleApplicationCount: number
  femaleApplicationCount: number
  waitlistedCount: number
  settlementExceptionCount: number
}>

export type AdminTeamSummary = Readonly<{
  id: string
  teamNumber: number
  code: string
  status: string
  activityTitle: string
  venueName: string | null
  memberCount: number
  maleCount: number
  femaleCount: number
  paidCount: number
  arrivedCount: number
  confirmedCount: number | null
  openReportCount: number
}>

export type AdminExceptionView = Readonly<{
  key?: string
  detailLoaded?: boolean
  kind:
    | 'missing_arrival'
    | 'active_report'
    | 'refund_dead_letter'
    | 'headcount_mismatch'
    | 'settlement_finalize_pending'
    | 'deposit_manual_review'
    | 'deposit_reconciliation_failed'
    | 'service_confirmation_missing'
  teamId: string
  teamCode: string
  subjectUserId: string | null
  subjectName: string | null
  subjectPhone: string | null
  reporterUserId: string | null
  reporterName: string | null
  reporterPhone: string | null
  businessContactUserId?: string | null
  businessContactRole?: 'subject' | 'reporter' | null
  businessContactPhoneMasked?: string | null
  reportId: string | null
  category: string | null
  refundRequestId: string | null
  refundRevision: number | null
  reconciliationJobId?: string | null
  reconciliationRevision?: number | null
  manualDepositId?: string | null
  manualDepositRevision?: number | null
  manualForfeitPolicyApproved?: boolean
  status: string
  callStatus?: string
  serviceAttemptId?: string | null
  reportedAttendeeCount?: number | null
  observedArrivedCount?: number | null
  serviceConfirmationRevision?: number | null
}>

export type AdminTeamPage = Readonly<{
  afterTeamNumber: number | null
  nextAfterTeamNumber: number | null
  limit: 50
}>

export type AdminRoundPage = Readonly<{
  cursor: string | null
  nextCursor: string | null
  limit: 50
}>

export type AdminExceptionPage = Readonly<{
  afterExceptionKey: string | null
  nextAfterExceptionKey: string | null
  limit: 50
  totalCount: number
  counts: Readonly<Record<string, number>>
}>

export type FinancialJobView = Readonly<{
  kind: 'deposit_disposition' | 'settlement'
  id: string
  revision: number
  teamId: string
  teamCode: string
  status: string
  attemptCount: number
  lastErrorCode: string | null
  createdAt: string
  updatedAt: string
}>

export type FinancialQueueHealth = Readonly<{
  depositDispositionActiveCount: number
  depositDeadLetterCount: number
  oldestDepositDispositionActiveAt: string | null
  settlementActiveCount: number
  settlementDeadLetterCount: number
  oldestSettlementActiveAt: string | null
  refundActiveCount: number
  refundFailedCount: number
  oldestRefundActiveAt: string | null
  reconciliationActiveCount: number
  reconciliationFailedCount: number
  oldestReconciliationActiveAt: string | null
  notificationActiveCount: number
  notificationFailedCount: number
  oldestNotificationActiveAt: string | null
  pushActiveCount: number
  pushFailedCount: number
  oldestPushActiveAt: string | null
  jobs: readonly FinancialJobView[]
}>

export type FinancialJobPage = Readonly<{
  cursor: string | null
  nextCursor: string | null
  limit: 50
}>

export type AllocatorFailureView = Readonly<{
  roundId: string
  lowerBoundTeamCount: number
  upperBoundTeamCount: number
  applicantCount: number
  attemptedAt: string
  errorCode: string
  status: 'open' | 'resolved'
  revision: number
}>

export type AllocatorFailurePage = Readonly<{
  cursor: string | null
  nextCursor: string | null
  limit: 50
}>

export type AdminTonightData = Readonly<{
  rounds: readonly AdminRoundView[]
  activeRoundId: string | null
  teams: readonly AdminTeamSummary[]
  exceptions: readonly AdminExceptionView[]
  roundPage: AdminRoundPage
  teamPage: AdminTeamPage
  exceptionPage: AdminExceptionPage
  financialHealth: FinancialQueueHealth
  financialJobPage: FinancialJobPage
  allocationFailures: readonly AllocatorFailureView[]
  allocationFailurePage: AllocatorFailurePage
  arrivalHelpRequests: readonly TonightArrivalHelpView[]
}>

export interface AdminTonightAdapter {
  load(input?: {
    roundId?: string
    roundCursor?: string | null
    afterTeamNumber?: number | null
    afterExceptionKey?: string | null
    financialCursor?: string | null
    allocationFailureCursor?: string | null
  }): Promise<AdminTonightData>
  loadExceptionDetail(input: {
    roundId: string
    exceptionKey: string
  }): Promise<AdminExceptionView>
  recordCall(input: {
    teamId: string
    subjectUserId: string
    outcome: 'answered' | 'no_answer' | 'wrong_number' | 'arriving' | 'cancelled'
  }): Promise<AdminTonightData>
  updateArrivalHelp(input: {
    requestId: string
    action: 'acknowledge' | 'escalate' | 'resolve'
    expectedRevision: number
  }): Promise<AdminTonightData>
}

export type SuperAdminMemberView = Readonly<{
  teamRevision: number
  applicationId: string
  userId: string
  name: string
  phone: string
  photoUrls: readonly string[]
  age: number
  gender: 'male' | 'female'
  automaticScore: number
  adjustment: number
  finalScore: number
  featureRevision: number
  bundleId: string | null
  seatNumber: number
  depositStatus: string
  attendanceStatus: string
  attendanceRevision: number
}>

export type AuditEntryView = Readonly<{
  id: string
  actor: string
  at: string
  action: string
  before: string
  after: string
}>

export type AuditPage = Readonly<{
  cursor: string | null
  nextCursor: string | null
  limit: 50
}>

export type AccessMembershipView = Readonly<{
  id: string
  detailLoaded?: boolean
  revision: number
  label: string
  role: 'user' | 'partner' | 'admin' | 'super_admin'
  marketCode: string | null
  venueName: string | null
  status: 'active' | 'revoked'
}>

export type MarketMembershipPage = Readonly<{
  afterMembershipId: string | null
  nextAfterMembershipId: string | null
  limit: 50
  userId: string | null
}>

export type PartnerMembershipPage = Readonly<{
  afterMembershipId: string | null
  nextAfterMembershipId: string | null
  limit: 50
  userId: string | null
  venueId: string | null
}>

export type AccessDirectoryResult = Readonly<{
  accounts: readonly Readonly<{
    userId: string
    name: string
    email: string | null
  }>[]
  venues: readonly Readonly<{
    venueId: string
    name: string
    address: string | null
  }>[]
}>

export type NotificationFailureView = Readonly<{
  kind: 'in_app' | 'push'
  id: string
  revision: number
  roundId: string
  teamId: string | null
  eventType: string
  recipientRef: string
  teamRef: string | null
  failureCode: string
  attemptCount: number
  failedAt: string
  resubscribeRequired: boolean
}>

export type NotificationFailurePage = Readonly<{
  cursor: string | null
  nextCursor: string | null
  limit: 50
}>

export type SuperAdminTonightData = Readonly<{
  admin: AdminTonightData
  databaseApplicationsOpen: boolean
  activeTeamId: string | null
  members: readonly SuperAdminMemberView[]
  teamBundles: readonly Readonly<{
    teamId: string
    teamCode: string
    teamRevision: number
    bundles: readonly Readonly<{ bundleId: string; memberCount: number }>[]
  }>[]
  audit: readonly AuditEntryView[]
  auditPage: AuditPage
  memberships: readonly AccessMembershipView[]
  accessLoaded: boolean
  marketMembershipPage: MarketMembershipPage
  partnerMembershipPage: PartnerMembershipPage
  venueSnapshots: readonly PublicPlaceDto[]
  notificationFailures: readonly NotificationFailureView[]
  notificationFailurePage: NotificationFailurePage
}>

export interface SuperAdminTonightAdapter {
  load(input?: {
    roundId?: string
    roundCursor?: string | null
    teamId?: string
    afterTeamNumber?: number | null
    afterExceptionKey?: string | null
    financialCursor?: string | null
    allocationFailureCursor?: string | null
    auditCursor?: string | null
    notificationFailureCursor?: string | null
  }): Promise<SuperAdminTonightData>
  loadExceptionDetail(input: {
    roundId: string
    exceptionKey: string
  }): Promise<AdminExceptionView>
  loadAccess(input?: {
    afterMembershipId?: string | null
    userId?: string | null
    partnerAfterMembershipId?: string | null
    partnerUserId?: string | null
    partnerVenueId?: string | null
  }): Promise<SuperAdminTonightData>
  loadAccessDetail(input: {
    membershipId: string
    role: 'user' | 'partner'
  }): Promise<AccessMembershipView>
  loadVenueSnapshots(input: { venueId: string }): Promise<readonly PublicPlaceDto[]>
  searchDirectory(query: string): Promise<AccessDirectoryResult>
  setDatabaseApplicationsOpen(input: {
    value: boolean
  }): Promise<SuperAdminTonightData>
  adjustAppearance(input: {
    applicationId: string
    score: number
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  swapBundles(input: {
    teamAId: string
    bundleAId: string
    expectedTeamARevision: number
    teamBId: string
    bundleBId: string
    expectedTeamBRevision: number
  }): Promise<SuperAdminTonightData>
  updateAttendance(input: {
    teamId: string
    userId: string
    status: 'pending' | 'arrived' | 'no_show' | 'excused'
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  recoverServiceConfirmation(input: {
    teamId: string
    attemptId: string
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  retryRefund(input: {
    requestId: string
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  retryReconciliation?(input: {
    jobId: string
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  resolveManualDeposit?(input: {
    depositId: string
    decision: 'refund' | 'forfeit'
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  retryFinancialJob(input: {
    jobKind: FinancialJobView['kind']
    jobId: string
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  retryNotificationFailure(input: {
    failureKind: NotificationFailureView['kind']
    failureId: string
    expectedRevision: number
  }): Promise<SuperAdminTonightData>
  updateMembership(input: {
    subject: string
    role: AccessMembershipView['role']
    marketCode?: string
    venueId?: string
    action: 'grant' | 'revoke'
  }): Promise<SuperAdminTonightData>
  saveVenueSnapshot(input: {
    venueId: string
    latitude: number
    longitude: number
  }): Promise<SuperAdminTonightData>
}
