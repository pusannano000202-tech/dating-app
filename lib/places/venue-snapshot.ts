import type { PublicPlaceDto } from './contracts'
import { projectPublicPlace } from './public-projection'

type VenueSnapshotRow = Readonly<Record<string, unknown>>

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(code)
  return value.trim()
}

function nullableProviderLink(url: unknown, kind: unknown): unknown {
  if (url === null && kind === null) return null
  return { url, kind }
}

export function projectVenueSnapshotRow(row: VenueSnapshotRow): PublicPlaceDto {
  const venueId = requiredString(row.venue_id, 'invalid_venue_snapshot_venue_id')
  const snapshotRevision = requiredString(
    row.snapshot_revision,
    'invalid_venue_snapshot_revision',
  )

  const address = row.address === null
    ? null
    : {
        road: row.address,
        evidence: row.address_evidence,
        verifiedAt: row.address_verified_at,
      }

  const coordinates = row.latitude === null && row.longitude === null
    ? null
    : {
        latitude: row.latitude,
        longitude: row.longitude,
        evidence: row.coordinate_evidence,
        verifiedAt: row.coordinates_verified_at,
      }

  return projectPublicPlace({
    placeRef: `venue:${venueId}`,
    snapshotRevision,
    displayName: row.display_name,
    category: row.venue_category,
    areaLabel: row.area_label,
    address,
    coordinates,
    providerLinks: {
      naver: nullableProviderLink(row.naver_url, row.naver_link_kind),
      kakao: nullableProviderLink(row.kakao_url, row.kakao_link_kind),
    },
  })
}
