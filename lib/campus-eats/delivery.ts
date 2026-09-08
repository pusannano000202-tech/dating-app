import { deliveryVerification } from './delivery-verification'

export type DeliveryCandidate = {
  id: string
  storeName: string
  menuName: string
  region: string
  menuPrice: number | null
  mandatoryOptionPrice: number | null
  minimumOrderPrice: number | null
  deliveryFee: number | null
  singleServing: boolean
  membershipCondition: string
  benefit: string | null
  orderUrl: string
  sourceUrl: string
  verifiedAt: string | null
  benefitVerifiedAt: string | null
  expiresAt: string | null
  imagePath: string | null
  imageRights: string | null
  publicationStatus: 'draft' | 'verified' | 'retired'
  revision: number
}

const ORDER_HOSTS = ['coupangeats.com', 'baemin.com', 'yogiyo.co.kr']
const KEYS = ['id', 'storeName', 'menuName', 'region', 'menuPrice', 'mandatoryOptionPrice', 'minimumOrderPrice', 'deliveryFee', 'singleServing', 'membershipCondition', 'benefit', 'orderUrl', 'sourceUrl', 'verifiedAt', 'benefitVerifiedAt', 'expiresAt', 'imagePath', 'imageRights', 'publicationStatus', 'revision']
export const DELIVERY_MINIMUM_CANDIDATES = 8

export function isAllowedDeliveryUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ORDER_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch { return false }
}

export function validateDeliveryCandidate(value: unknown): { ok: true; candidate: DeliveryCandidate } | { ok: false; error: string } {
  const bad = { ok: false as const, error: 'invalid_delivery_candidate' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== KEYS.length || Object.keys(row).some((key) => !KEYS.includes(key))) return bad
  if (typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,95}$/.test(row.id)) return bad
  for (const key of ['storeName', 'menuName', 'region', 'membershipCondition']) {
    if (typeof row[key] !== 'string' || !(row[key] as string).trim() || (row[key] as string).length > 200) return bad
  }
  for (const key of ['menuPrice', 'mandatoryOptionPrice', 'minimumOrderPrice', 'deliveryFee']) {
    if (row[key] !== null && (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0 || (row[key] as number) > 1000000)) return bad
  }
  for (const key of ['verifiedAt', 'benefitVerifiedAt', 'expiresAt']) {
    if (row[key] !== null && (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key] as string)))) return bad
  }
  if (typeof row.singleServing !== 'boolean' || !['draft', 'verified', 'retired'].includes(row.publicationStatus as string)
    || !Number.isSafeInteger(row.revision) || (row.revision as number) < 0) return bad
  if (!isAllowedDeliveryUrl(row.orderUrl) || !isAllowedDeliveryUrl(row.sourceUrl)) return bad
  if (row.benefit !== null && (typeof row.benefit !== 'string' || !row.benefit.trim() || row.benefit.length > 300)) return bad
  if (row.imageRights !== null && (typeof row.imageRights !== 'string' || !row.imageRights.trim() || row.imageRights.length > 500)) return bad
  if (row.imagePath !== null && (typeof row.imagePath !== 'string' || !/^\/campus-eats\/delivery\/[a-zA-Z0-9_-]+\.(webp|png|jpg)$/.test(row.imagePath) || !row.imageRights)) return bad
  return { ok: true, candidate: row as DeliveryCandidate }
}

export function deliveryAvailability(candidates: readonly DeliveryCandidate[], now: Date) {
  const unique = new Map<string, DeliveryCandidate>()
  for (const row of candidates) {
    if (validateDeliveryCandidate(row).ok && deliveryVerification(row, now).eligible) unique.set(row.id, row)
  }
  const eligible = [...unique.values()]
  return { candidates: eligible, verifiedCount: eligible.length, minimum: DELIVERY_MINIMUM_CANDIDATES, canStart: eligible.length >= DELIVERY_MINIMUM_CANDIDATES }
}

export function deliveryRecordKey(region: string) { return `quantum:delivery:v1:${encodeURIComponent(region)}` }
export function formatDeliveryPrice(value: number | null) { return value === null ? '미확인' : `${value.toLocaleString('ko-KR')}원` }
