import type { AdminExceptionView } from './types'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function mapManualDepositException(
  value: unknown,
  forfeitPolicyApproved: boolean,
): AdminExceptionView | null {
  const row = record(value)
  if (!row) return null
  const depositId = nullableText(row.deposit_id)
  const depositRevision = Number.isInteger(row.deposit_revision) ? row.deposit_revision as number : null
  const teamId = nullableText(row.team_id)
  const attendanceStatus = row.attendance_status === 'pending' || row.attendance_status === 'no_show'
    ? row.attendance_status
    : null
  if (!depositId || depositRevision === null || depositRevision < 0 || !teamId || !attendanceStatus) {
    return null
  }
  return {
    kind: 'deposit_manual_review',
    teamId,
    teamCode: nullableText(row.team_code) ?? '',
    subjectUserId: nullableText(row.subject_user_id),
    subjectName: nullableText(row.subject_display_name),
    subjectPhone: nullableText(row.subject_phone),
    reporterUserId: null,
    reporterName: null,
    reporterPhone: null,
    reportId: null,
    category: null,
    refundRequestId: null,
    refundRevision: null,
    reconciliationJobId: null,
    reconciliationRevision: null,
    manualDepositId: depositId,
    manualDepositRevision: depositRevision,
    manualForfeitPolicyApproved: forfeitPolicyApproved,
    status: attendanceStatus,
  }
}

export function mergeSuperAdminManualDepositExceptions(
  exceptions: readonly AdminExceptionView[],
  deposits: unknown,
  forfeitPolicyApproved: unknown,
): AdminExceptionView[] {
  if (!Array.isArray(deposits) || typeof forfeitPolicyApproved !== 'boolean') {
    throw new Error('수동 보증금 응답이 올바르지 않아요. 잠시 뒤 다시 시도해 주세요.')
  }
  const mapped = deposits.map((deposit) => (
    mapManualDepositException(deposit, forfeitPolicyApproved)
  ))
  if (mapped.some((exception) => exception === null)) {
    throw new Error('수동 보증금 응답이 올바르지 않아요. 잠시 뒤 다시 시도해 주세요.')
  }
  return [
    ...exceptions.filter((exception) => exception.kind !== 'deposit_manual_review'),
    ...mapped.filter((exception): exception is AdminExceptionView => exception !== null),
  ]
}
