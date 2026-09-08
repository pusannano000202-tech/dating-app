export interface TonightDefaultScheduleKst {
  signupCloseAt: string
  capacityLockAt: string
  allocationPublishAt: string
  depositDueAt: string
  partnerAcceptanceDueAt: string
  revealAt: string
  arrivalAt: string
  startsAt: string
}

function assertServiceDate(serviceDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new TypeError('invalid_service_date')
  }

  const parsed = new Date(`${serviceDate}T00:00:00.000Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== serviceDate) {
    throw new TypeError('invalid_service_date')
  }
}

export function buildDefaultTonightScheduleKst(
  serviceDate: string,
): TonightDefaultScheduleKst {
  assertServiceDate(serviceDate)
  const at = (time: string) => `${serviceDate}T${time}:00+09:00`

  return Object.freeze({
    signupCloseAt: at('18:30'),
    capacityLockAt: at('18:30'),
    allocationPublishAt: at('18:32'),
    depositDueAt: at('18:45'),
    partnerAcceptanceDueAt: at('18:50'),
    revealAt: at('18:55'),
    arrivalAt: at('19:20'),
    startsAt: at('19:30'),
  })
}
