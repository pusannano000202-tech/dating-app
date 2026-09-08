import type { AdminExceptionView } from './types'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function mapReconciliationException(value: unknown): AdminExceptionView | null {
  const row = record(value)
  if (!row) return null
  const jobId = typeof row.job_id === 'string' && row.job_id ? row.job_id : null
  const jobRevision = typeof row.job_revision === 'number' && Number.isInteger(row.job_revision)
    ? row.job_revision
    : null
  const teamId = typeof row.team_id === 'string' && row.team_id ? row.team_id : null
  if (!jobId || jobRevision === null || jobRevision < 0 || !teamId) return null
  return {
    kind: 'deposit_reconciliation_failed',
    teamId,
    teamCode: typeof row.team_code === 'string' ? row.team_code : '',
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
    reconciliationJobId: jobId,
    reconciliationRevision: jobRevision,
    status: typeof row.error_code === 'string' && row.error_code
      ? row.error_code
      : typeof row.job_status === 'string' && row.job_status
        ? row.job_status
        : 'failed',
  }
}

export function mergeSuperAdminReconciliationExceptions(
  exceptions: readonly AdminExceptionView[],
  jobs: unknown,
): AdminExceptionView[] {
  if (!Array.isArray(jobs)) {
    throw new Error('결제 확인 작업 응답이 올바르지 않아요. 잠시 뒤 다시 시도해 주세요.')
  }
  const mappedJobs = jobs.map(mapReconciliationException)
  if (mappedJobs.some((exception) => exception === null)) {
    throw new Error('결제 확인 작업 응답이 올바르지 않아요. 잠시 뒤 다시 시도해 주세요.')
  }
  const authoritativeJobs = mappedJobs.filter(
    (exception): exception is AdminExceptionView => exception !== null,
  )
  return [
    ...exceptions.filter((exception) => exception.kind !== 'deposit_reconciliation_failed'),
    ...authoritativeJobs,
  ]
}
