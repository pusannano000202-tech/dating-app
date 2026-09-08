import {
  PLACE_ADDRESS_EVIDENCE,
  PLACE_COORDINATE_EVIDENCE,
  PLACE_LINK_KINDS,
  PUBLIC_PLACE_CATEGORIES,
  type PlaceAddressEvidence,
  type PlaceCoordinateEvidence,
  type PlaceLinkKind,
  type PlaceProvider,
  type PlaceProviderLink,
  type PublicPlaceAddress,
  type PublicPlaceCategory,
  type PublicPlaceCoordinates,
  type PublicPlaceDto,
} from './contracts'
import { createProviderLink } from './provider-links'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredRecord(value: unknown, error: string): UnknownRecord {
  if (!isRecord(value)) throw new TypeError(error)
  return value
}

function requiredString(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(error)
  return value.trim()
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null) return null
  return requiredString(value, 'invalid_place_verified_at')
}

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.some((item) => item === value)
}

function projectCategory(value: unknown): PublicPlaceCategory {
  if (!isOneOf(value, PUBLIC_PLACE_CATEGORIES)) throw new TypeError('invalid_place_category')
  return value
}

function projectAddress(value: unknown): PublicPlaceAddress | null {
  if (value === null) return null
  const source = requiredRecord(value, 'invalid_place_address')
  if (!isOneOf(source.evidence, PLACE_ADDRESS_EVIDENCE)) {
    throw new TypeError('invalid_place_address_evidence')
  }

  const evidence: PlaceAddressEvidence = source.evidence
  return Object.freeze({
    road: requiredString(source.road, 'invalid_place_address'),
    evidence,
    verifiedAt: nullableTimestamp(source.verifiedAt),
  })
}

function projectCoordinates(value: unknown): PublicPlaceCoordinates | null {
  if (value === null) return null
  const source = requiredRecord(value, 'invalid_place_coordinates')
  const latitude = source.latitude
  const longitude = source.longitude

  if (
    typeof latitude !== 'number'
    || typeof longitude !== 'number'
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    throw new TypeError('invalid_place_coordinates')
  }
  if (!isOneOf(source.evidence, PLACE_COORDINATE_EVIDENCE)) {
    throw new TypeError('invalid_place_coordinate_evidence')
  }

  const evidence: PlaceCoordinateEvidence = source.evidence
  return Object.freeze({
    latitude,
    longitude,
    evidence,
    verifiedAt: nullableTimestamp(source.verifiedAt),
  })
}

function projectProviderLink(value: unknown, provider: PlaceProvider): PlaceProviderLink | null {
  if (value === null || value === undefined) return null
  const source = requiredRecord(value, 'invalid_provider_link')
  const url = requiredString(source.url, 'invalid_provider_url')
  if (!isOneOf(source.kind, PLACE_LINK_KINDS)) throw new TypeError('invalid_provider_link_kind')

  const kind: PlaceLinkKind = source.kind
  return createProviderLink(provider, url, kind)
}

export function projectPublicPlace(value: unknown): PublicPlaceDto {
  const source = requiredRecord(value, 'invalid_public_place')
  const providerLinks = requiredRecord(source.providerLinks, 'invalid_provider_links')

  return Object.freeze({
    placeRef: requiredString(source.placeRef, 'invalid_place_ref'),
    snapshotRevision: requiredString(source.snapshotRevision, 'invalid_snapshot_revision'),
    displayName: requiredString(source.displayName, 'invalid_place_display_name'),
    category: projectCategory(source.category),
    areaLabel: requiredString(source.areaLabel, 'invalid_place_area_label'),
    address: projectAddress(source.address),
    coordinates: projectCoordinates(source.coordinates),
    providerLinks: Object.freeze({
      naver: projectProviderLink(providerLinks.naver, 'naver'),
      kakao: projectProviderLink(providerLinks.kakao, 'kakao'),
    }),
  })
}
