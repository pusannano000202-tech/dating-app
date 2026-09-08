type UnknownRecord = Record<string, unknown>

export interface AdminExceptionDetailDto {
  exception_key: string
  exception_kind: string
  exception_team_id: string
  exception_team_code: string
  contact_user_id: string | null
  contact_role: 'subject' | 'reporter' | null
  contact_phone_masked: string | null
  report_id: string | null
  report_category: string | null
  exception_status: string
  refund_request_id: string | null
  refund_request_revision: number | null
  reconciliation_job_id: string | null
  reconciliation_revision: number | null
  manual_deposit_id: string | null
  manual_deposit_revision: number | null
  service_attempt_id: string | null
  reported_attendee_count: number | null
  observed_arrived_count: number | null
  service_confirmation_revision: number | null
  call_status: string | null
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function maskAdminContactPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let digits = value.replace(/[^0-9]/g, '')
  if (digits.startsWith('8210') && digits.length === 12) digits = `0${digits.slice(2)}`
  if (digits.length < 7) return null

  const prefixLength = digits.startsWith('02') ? 2 : 3
  return `${digits.slice(0, prefixLength)}-****-${digits.slice(-4)}`
}

/**
 * Converts both the legacy bilateral RPC row and the new privacy-minimized row
 * into one exact client DTO. Unknown fields, names and raw phone numbers are
 * never copied to the response.
 */
export function toAdminExceptionDetailDto(value: unknown): AdminExceptionDetailDto | null {
  if (!isRecord(value)) return null

  const exceptionKey = nullableString(value.exception_key)
  const exceptionKind = nullableString(value.exception_kind)
  const teamId = nullableString(value.exception_team_id)
  const teamCode = nullableString(value.exception_team_code)
  const status = nullableString(value.exception_status)
  if (!exceptionKey || !exceptionKind || !teamId || !teamCode || !status) return null

  const newContactId = nullableString(value.contact_user_id)
  const subjectId = nullableString(value.subject_user_id)
  const reporterId = nullableString(value.reporter_user_id)
  const contactUserId = newContactId ?? subjectId ?? reporterId
  const explicitRole = value.contact_role === 'subject' || value.contact_role === 'reporter'
    ? value.contact_role
    : null
  const contactRole = explicitRole ?? (subjectId ? 'subject' : reporterId ? 'reporter' : null)
  const contactPhone = value.contact_phone_masked
    ?? (contactRole === 'subject' ? value.subject_phone : value.reporter_phone)

  return {
    exception_key: exceptionKey,
    exception_kind: exceptionKind,
    exception_team_id: teamId,
    exception_team_code: teamCode,
    contact_user_id: contactUserId,
    contact_role: contactRole,
    contact_phone_masked: maskAdminContactPhone(contactPhone),
    report_id: nullableString(value.report_id),
    report_category: nullableString(value.report_category),
    exception_status: status,
    refund_request_id: nullableString(value.refund_request_id),
    refund_request_revision: nullableInteger(value.refund_request_revision),
    reconciliation_job_id: nullableString(value.reconciliation_job_id),
    reconciliation_revision: nullableInteger(value.reconciliation_revision),
    manual_deposit_id: nullableString(value.manual_deposit_id),
    manual_deposit_revision: nullableInteger(value.manual_deposit_revision),
    service_attempt_id: nullableString(value.service_attempt_id),
    reported_attendee_count: nullableInteger(value.reported_attendee_count),
    observed_arrived_count: nullableInteger(value.observed_arrived_count),
    service_confirmation_revision: nullableInteger(value.service_confirmation_revision),
    call_status: nullableString(value.call_status),
  }
}
