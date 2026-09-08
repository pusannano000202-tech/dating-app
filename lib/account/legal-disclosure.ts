export type LegalDisclosure = {
  publishable: boolean
  operatorName: string | null
  operatorAddress: string | null
  operatorContact: string | null
  privacyContact: string | null
}

type LegalEnvironment = Record<string, string | undefined>

export function readLegalDisclosure(environment: LegalEnvironment = process.env): LegalDisclosure {
  const operatorName = cleanLegalValue(environment.SERVICE_OPERATOR_NAME)
  const operatorAddress = cleanLegalValue(environment.SERVICE_OPERATOR_ADDRESS)
  const operatorContact = cleanLegalValue(environment.SERVICE_OPERATOR_CONTACT)
  const privacyContact = cleanLegalValue(environment.PRIVACY_CONTACT)
  return {
    publishable: Boolean(operatorName && operatorAddress && operatorContact && privacyContact),
    operatorName,
    operatorAddress,
    operatorContact,
    privacyContact,
  }
}

function cleanLegalValue(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null
  const normalized = value.trim()
  if (!normalized || normalized.length > 240) return null
  if (/^(todo|tbd|미정|확정 전|example\.(com|org))$/i.test(normalized)) return null
  return normalized
}
