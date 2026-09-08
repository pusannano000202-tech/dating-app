export const PUBLIC_PLACE_KEYS = [
  'placeRef',
  'snapshotRevision',
  'displayName',
  'category',
  'areaLabel',
  'address',
  'coordinates',
  'providerLinks',
] as const

export const PUBLIC_PLACE_CATEGORIES = [
  'cafe',
  'restaurant',
  'bar',
  'activity',
  'public-meeting-point',
  'other',
] as const

export const PLACE_ADDRESS_EVIDENCE = [
  'host-supplied',
  'search-verified',
  'provider-verified',
  'operator-verified',
] as const

export const PLACE_COORDINATE_EVIDENCE = [
  'geocoded-address',
  'provider-verified',
  'operator-verified',
] as const

export const PLACE_LINK_KINDS = ['place', 'search'] as const

export type PublicPlaceCategory = (typeof PUBLIC_PLACE_CATEGORIES)[number]
export type PlaceAddressEvidence = (typeof PLACE_ADDRESS_EVIDENCE)[number]
export type PlaceCoordinateEvidence = (typeof PLACE_COORDINATE_EVIDENCE)[number]
export type PlaceLinkKind = (typeof PLACE_LINK_KINDS)[number]
export type PlaceProvider = 'naver' | 'kakao'

export type PublicPlaceAddress = Readonly<{
  road: string
  evidence: PlaceAddressEvidence
  verifiedAt: string | null
}>

export type PublicPlaceCoordinates = Readonly<{
  latitude: number
  longitude: number
  evidence: PlaceCoordinateEvidence
  verifiedAt: string | null
}>

export type PlaceProviderLink = Readonly<{
  url: string
  kind: PlaceLinkKind
}>

export type PlaceProviderLinks = Readonly<{
  naver: PlaceProviderLink | null
  kakao: PlaceProviderLink | null
}>

export type PublicPlaceDto = Readonly<{
  placeRef: string
  snapshotRevision: string
  displayName: string
  category: PublicPlaceCategory
  areaLabel: string
  address: PublicPlaceAddress | null
  coordinates: PublicPlaceCoordinates | null
  providerLinks: PlaceProviderLinks
}>
