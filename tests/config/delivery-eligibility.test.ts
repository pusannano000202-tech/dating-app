import assert from 'node:assert/strict'
import test from 'node:test'
import { deliveryAvailability, deliveryRecordKey, validateDeliveryCandidate, type DeliveryCandidate } from '../../lib/campus-eats/delivery'
import { deliveryVerification } from '../../lib/campus-eats/delivery-verification'

const now = new Date('2026-09-05T12:00:00Z')
const candidate: DeliveryCandidate = {
  id: 'pnu-store-menu', storeName: '검증 테스트 가게', menuName: '1인 메뉴', region: '부산대 정문',
  menuPrice: 8000, mandatoryOptionPrice: 0, minimumOrderPrice: 8000, deliveryFee: null,
  singleServing: true, membershipCondition: '멤버십 없이 주문 조건 확인', benefit: null,
  orderUrl: 'https://www.coupangeats.com/store/test-menu', sourceUrl: 'https://www.coupangeats.com/store/test-menu',
  verifiedAt: '2026-09-05T11:00:00Z', benefitVerifiedAt: null, expiresAt: null,
  imagePath: '/campus-eats/delivery/test-menu.webp', imageRights: 'Test-only fixture rights evidence; not a real candidate', publicationStatus: 'verified', revision: 1,
}
test('only currently verified one-menu-order candidates qualify; unknown never becomes free', () => {
  assert.equal(deliveryVerification(candidate, now).eligible, true)
  assert.equal(candidate.deliveryFee, null)
  assert.equal(deliveryVerification({ ...candidate, minimumOrderPrice: null }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, minimumOrderPrice: 9000 }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, publicationStatus: 'draft' }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, singleServing: false }, now).eligible, false)
})
test('publication requires licensed menu photo, the same public area and a specific evidence link', () => {
  assert.equal(deliveryVerification({ ...candidate, imagePath: null }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, imageRights: null }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, region: '서울' }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, sourceUrl: 'https://www.coupangeats.com/' }, now).eligible, false)
})
test('store/menu information expires at seven days; benefits at twenty-four hours', () => {
  assert.equal(deliveryVerification({ ...candidate, verifiedAt: '2026-08-29T12:00:00Z' }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, benefit: '조건부 할인', benefitVerifiedAt: '2026-09-04T12:00:00Z' }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, verifiedAt: '2026-09-06T12:00:00Z' }, now).eligible, false)
  assert.equal(deliveryVerification({ ...candidate, expiresAt: now.toISOString() }, now).eligible, false)
})
test('validation blocks unsafe URLs, arbitrary fields and unlicensed images', () => {
  assert.equal(validateDeliveryCandidate(candidate).ok, true)
  for (const orderUrl of ['javascript:alert(1)', 'http://www.coupangeats.com/', 'https://www.coupangeats.com.evil.test/', 'https://user:pw@www.coupangeats.com/']) {
    assert.equal(validateDeliveryCandidate({ ...candidate, orderUrl }).ok, false)
  }
  assert.equal(validateDeliveryCandidate({ ...candidate, customerAddress: 'private' }).ok, false)
  assert.equal(validateDeliveryCandidate({ ...candidate, imagePath: '/campus-eats/test.webp' }).ok, false)
})
test('public competition opens at eight distinct verified menu candidates and keeps visit records isolated', () => {
  assert.equal(deliveryAvailability(Array.from({ length: 7 }, (_, n) => ({ ...candidate, id: `menu-${n}` })), now).canStart, false)
  assert.equal(deliveryAvailability(Array.from({ length: 8 }, (_, n) => ({ ...candidate, id: `menu-${n}` })), now).canStart, true)
  assert.equal(deliveryAvailability(Array.from({ length: 8 }, () => candidate), now).canStart, false)
  assert.match(deliveryRecordKey('pnu'), /^quantum:delivery:/)
  assert.doesNotMatch(deliveryRecordKey('pnu'), /visited|personal-rating/)
})
