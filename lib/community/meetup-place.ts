import type { MeetupCategory } from './contracts'
import type { PublicPlaceCategory, PublicPlaceDto } from '../places/contracts'
import { buildProviderSearchLinks } from '../places/provider-links'

const ACTIVITY_CATEGORIES = new Set<MeetupCategory>([
  'baseball',
  'soccer',
  'basketball',
  'badminton',
  'tennis',
  'running',
  'board_game',
  'gaming',
  'hiking',
])

function publicCategory(category: MeetupCategory): PublicPlaceCategory {
  if (category === 'dining') return 'restaurant'
  if (ACTIVITY_CATEGORIES.has(category)) return 'activity'
  return 'public-meeting-point'
}

export function projectLegacyMeetupPlace({
  meetupId,
  placeName,
  category,
}: {
  meetupId: string
  placeName: string
  category: MeetupCategory
}): PublicPlaceDto {
  const normalizedId = meetupId.trim()
  const normalizedName = placeName.trim()

  if (!normalizedId) throw new TypeError('invalid_meetup_place_identity')
  if (!normalizedName) throw new TypeError('invalid_meetup_place_name')

  return Object.freeze({
    placeRef: `meetup:${normalizedId}`,
    snapshotRevision: `legacy-place-name:${normalizedId}`,
    displayName: normalizedName,
    category: publicCategory(category),
    areaLabel: '장소명 기준 검색',
    address: null,
    coordinates: null,
    providerLinks: buildProviderSearchLinks(normalizedName),
  })
}
