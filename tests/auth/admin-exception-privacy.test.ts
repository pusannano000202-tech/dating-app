import assert from 'node:assert/strict'
import test from 'node:test'

import {
  maskAdminContactPhone,
  toAdminExceptionDetailDto,
} from '../../lib/auth/admin-exception-privacy'

const BASE_ROW = {
  exception_key: '0000000001:20:active_report:00000000-0000-4000-8000-000000000001',
  exception_kind: 'active_report',
  exception_team_id: '10000000-0000-4000-8000-000000000001',
  exception_team_code: 'Q-001',
  report_id: '20000000-0000-4000-8000-000000000001',
  report_category: 'safety',
  exception_status: 'open',
}

test('phone masking normalizes local and E.164 Korean mobile numbers', () => {
  assert.equal(maskAdminContactPhone('010-1234-5678'), '010-****-5678')
  assert.equal(maskAdminContactPhone('+82 10 1234 5678'), '010-****-5678')
  assert.equal(maskAdminContactPhone('123'), null)
})

test('legacy bilateral rows become one exact masked contact without names or raw phones', () => {
  const dto = toAdminExceptionDetailDto({
    ...BASE_ROW,
    subject_user_id: '30000000-0000-4000-8000-000000000001',
    subject_display_name: 'subject name',
    subject_phone: '010-1234-5678',
    reporter_user_id: '40000000-0000-4000-8000-000000000001',
    reporter_display_name: 'reporter name',
    reporter_phone: '010-9999-0000',
  })

  assert.ok(dto)
  assert.equal(dto.contact_user_id, '30000000-0000-4000-8000-000000000001')
  assert.equal(dto.contact_role, 'subject')
  assert.equal(dto.contact_phone_masked, '010-****-5678')
  assert.deepEqual(Object.keys(dto).sort(), [
    'call_status',
    'contact_phone_masked',
    'contact_role',
    'contact_user_id',
    'exception_key',
    'exception_kind',
    'exception_status',
    'exception_team_code',
    'exception_team_id',
    'manual_deposit_id',
    'manual_deposit_revision',
    'observed_arrived_count',
    'reconciliation_job_id',
    'reconciliation_revision',
    'refund_request_id',
    'refund_request_revision',
    'report_category',
    'report_id',
    'reported_attendee_count',
    'service_attempt_id',
    'service_confirmation_revision',
  ])
})

test('new minimized rows stay minimized and malformed responses fail closed', () => {
  const dto = toAdminExceptionDetailDto({
    ...BASE_ROW,
    contact_user_id: '30000000-0000-4000-8000-000000000001',
    contact_role: 'subject',
    contact_phone_masked: '010-****-5678',
    unexpected_raw_phone: '010-0000-0000',
  })
  assert.equal(dto?.contact_phone_masked, '010-****-5678')
  assert.equal('unexpected_raw_phone' in (dto ?? {}), false)
  assert.equal(toAdminExceptionDetailDto({ ...BASE_ROW, exception_status: null }), null)
})
