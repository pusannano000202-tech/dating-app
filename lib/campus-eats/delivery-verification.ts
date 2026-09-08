import type { DeliveryCandidate } from './delivery'

const DAY = 24 * 60 * 60 * 1000
export const DELIVERY_PUBLIC_REGION = '부산대 정문'

function isSpecificEvidenceLink(value: string) {
  try { const url = new URL(value); return url.pathname !== '/' && url.pathname !== '' || Boolean(url.search) }
  catch { return false }
}

export function deliveryVerification(candidate: DeliveryCandidate, now: Date): { eligible: boolean; reason: string } {
  const current = now.getTime()
  const verified = Date.parse(candidate.verifiedAt ?? '')
  if (!Number.isFinite(current) || !Number.isFinite(verified) || verified > current) return { eligible: false, reason: '확인 시각 미검증' }
  if (candidate.publicationStatus !== 'verified') return { eligible: false, reason: '공개 검수 전' }
  if (!candidate.imagePath || !candidate.imageRights?.trim()) return { eligible: false, reason: '대표 사진·사용 권리 미확인' }
  if (candidate.region !== DELIVERY_PUBLIC_REGION) return { eligible: false, reason: '동일 공용 기준 지역 미검증' }
  if (!isSpecificEvidenceLink(candidate.orderUrl) || !isSpecificEvidenceLink(candidate.sourceUrl)) return { eligible: false, reason: '가게·메뉴별 확인 링크 필요' }
  if (current - verified >= 7 * DAY) return { eligible: false, reason: '메뉴 정보 재확인 필요' }
  if (candidate.expiresAt && Date.parse(candidate.expiresAt) <= current) return { eligible: false, reason: '확인 조건 만료' }
  if (candidate.benefit) {
    const benefitAt = Date.parse(candidate.benefitVerifiedAt ?? '')
    if (!Number.isFinite(benefitAt) || benefitAt > current || current - benefitAt >= DAY) return { eligible: false, reason: '혜택 재확인 필요' }
  }
  if (!candidate.singleServing || candidate.menuPrice === null || candidate.mandatoryOptionPrice === null || candidate.minimumOrderPrice === null) return { eligible: false, reason: '1인 메뉴 주문 조건 미확인' }
  if (candidate.menuPrice + candidate.mandatoryOptionPrice < candidate.minimumOrderPrice) return { eligible: false, reason: '메뉴 한 개로 최소 주문 금액 미충족' }
  return { eligible: true, reason: '확인된 조건' }
}
