import type { CampusEatsCandidate } from './fixtures/pnu-categories'
import type { PublicPlaceCategory, PublicPlaceDto } from '../places/contracts'
import { buildProviderSearchLinks } from '../places/provider-links'
import { projectPublicPlace } from '../places/public-projection'

export const CAMPUS_EATS_PLACE_FIXTURE_REVISION = 'campus-eats-place-fixture-v1'

export type CampusEatsPlaceContext = Readonly<{
  schoolName?: string
}>

export type CampusEatsMapResolutionStatus = 'missing-addresses' | 'unresolved-addresses' | 'ready'

export type CampusEatsMapCoverage = Readonly<{
  totalCandidateCount: number
  markerCount: number
  unresolvedCount: number
  resolvedCandidateIds: readonly string[]
  unresolvedCandidateIds: readonly string[]
  state: 'empty' | 'partial' | 'complete'
}>

export type CampusEatsResolvedCoordinate = Readonly<{
  candidateId: string
  latitude: number
  longitude: number
}>

export type CampusEatsDisplayMarker = CampusEatsResolvedCoordinate & Readonly<{
  displayLatitude: number
  displayLongitude: number
  overlapGroupSize: number
  displayOffsetApplied: boolean
}>

export type CampusEatsMarkerCluster = Readonly<{
  clusterId: string
  candidateIds: readonly string[]
  latitude: number
  longitude: number
  candidateCount: number
  requiresPicker: boolean
}>

export function summarizeCampusEatsMapCoverage(
  candidateIds: readonly string[],
  resolvedCandidateIds: readonly string[],
): CampusEatsMapCoverage {
  const uniqueCandidateIds = [...new Set(candidateIds)]
  const resolvedSet = new Set(resolvedCandidateIds)
  const resolved = uniqueCandidateIds.filter((candidateId) => resolvedSet.has(candidateId))
  const unresolved = uniqueCandidateIds.filter((candidateId) => !resolvedSet.has(candidateId))
  const state = resolved.length === 0
    ? 'empty'
    : unresolved.length === 0
      ? 'complete'
      : 'partial'

  return Object.freeze({
    totalCandidateCount: uniqueCandidateIds.length,
    markerCount: resolved.length,
    unresolvedCount: unresolved.length,
    resolvedCandidateIds: Object.freeze(resolved),
    unresolvedCandidateIds: Object.freeze(unresolved),
    state,
  })
}

const OVERLAP_COORDINATE_PRECISION = 6
const OVERLAP_DISPLAY_RADIUS_METERS = 14
const METERS_PER_LATITUDE_DEGREE = 111_320
const NEARBY_MARKER_CLUSTER_METERS = 45
const MAX_MARKER_CLUSTER_CANDIDATES = 4

function distanceInMeters(
  a: Pick<CampusEatsResolvedCoordinate, 'latitude' | 'longitude'>,
  b: Pick<CampusEatsResolvedCoordinate, 'latitude' | 'longitude'>,
): number {
  const latitudeScale = Math.max(0.2, Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180))
  const latitudeMeters = (a.latitude - b.latitude) * METERS_PER_LATITUDE_DEGREE
  const longitudeMeters = (a.longitude - b.longitude) * METERS_PER_LATITUDE_DEGREE * latitudeScale
  return Math.hypot(latitudeMeters, longitudeMeters)
}

export function createCampusEatsMarkerClusters(
  coordinates: readonly CampusEatsResolvedCoordinate[],
  nearbyMeters = NEARBY_MARKER_CLUSTER_METERS,
): CampusEatsMarkerCluster[] {
  if (!Number.isFinite(nearbyMeters) || nearbyMeters <= 0) {
    throw new RangeError('invalid_marker_cluster_distance')
  }

  const visited = new Set<number>()
  const clusters: CampusEatsMarkerCluster[] = []

  for (let startIndex = 0; startIndex < coordinates.length; startIndex += 1) {
    if (visited.has(startIndex)) continue
    const memberIndexes = [startIndex]
    visited.add(startIndex)

    for (let candidateIndex = 0; candidateIndex < coordinates.length; candidateIndex += 1) {
      if (visited.has(candidateIndex)) continue
      if (memberIndexes.length >= MAX_MARKER_CLUSTER_CANDIDATES) break
      const fitsEveryMember = memberIndexes.every((memberIndex) => (
        distanceInMeters(coordinates[memberIndex], coordinates[candidateIndex]) <= nearbyMeters
      ))
      if (!fitsEveryMember) continue
      visited.add(candidateIndex)
      memberIndexes.push(candidateIndex)
    }

    const members = memberIndexes.map((index) => coordinates[index])
    const candidateIds = members.map((member) => member.candidateId)
    const latitude = members.reduce((sum, member) => sum + member.latitude, 0) / members.length
    const longitude = members.reduce((sum, member) => sum + member.longitude, 0) / members.length
    clusters.push(Object.freeze({
      clusterId: candidateIds.join('|'),
      candidateIds: Object.freeze(candidateIds),
      latitude,
      longitude,
      candidateCount: candidateIds.length,
      requiresPicker: candidateIds.length > 1,
    }))
  }

  return clusters
}

function coordinateGroupKey(coordinate: CampusEatsResolvedCoordinate): string {
  return `${coordinate.latitude.toFixed(OVERLAP_COORDINATE_PRECISION)}:${coordinate.longitude.toFixed(OVERLAP_COORDINATE_PRECISION)}`
}

export function createCampusEatsMarkerLayout(
  coordinates: readonly CampusEatsResolvedCoordinate[],
): CampusEatsDisplayMarker[] {
  const groups = new Map<string, CampusEatsResolvedCoordinate[]>()
  for (const coordinate of coordinates) {
    const key = coordinateGroupKey(coordinate)
    groups.set(key, [...(groups.get(key) ?? []), coordinate])
  }

  return coordinates.map((coordinate) => {
    const group = groups.get(coordinateGroupKey(coordinate)) ?? [coordinate]
    if (group.length === 1) {
      return {
        ...coordinate,
        displayLatitude: coordinate.latitude,
        displayLongitude: coordinate.longitude,
        overlapGroupSize: 1,
        displayOffsetApplied: false,
      }
    }

    const groupIndex = group.findIndex((item) => item.candidateId === coordinate.candidateId)
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * Math.max(0, groupIndex)) / group.length)
    const latitudeDelta = (OVERLAP_DISPLAY_RADIUS_METERS * Math.sin(angle)) / METERS_PER_LATITUDE_DEGREE
    const longitudeScale = Math.max(0.2, Math.cos((coordinate.latitude * Math.PI) / 180))
    const longitudeDelta = (OVERLAP_DISPLAY_RADIUS_METERS * Math.cos(angle))
      / (METERS_PER_LATITUDE_DEGREE * longitudeScale)

    return {
      ...coordinate,
      displayLatitude: coordinate.latitude + latitudeDelta,
      displayLongitude: coordinate.longitude + longitudeDelta,
      overlapGroupSize: group.length,
      displayOffsetApplied: true,
    }
  })
}

export function classifyCampusEatsMapResolution(
  addressCount: number,
  resolvedCoordinateCount: number,
): CampusEatsMapResolutionStatus {
  if (addressCount <= 0) return 'missing-addresses'
  return resolvedCoordinateCount > 0 ? 'ready' : 'unresolved-addresses'
}

function publicCategory(candidate: CampusEatsCandidate): PublicPlaceCategory {
  return candidate.categoryId === 'coffee-main' || candidate.categoryId === 'coffee-north'
    ? 'cafe'
    : 'restaurant'
}

function searchQuery(candidate: CampusEatsCandidate, context: CampusEatsPlaceContext): string {
  const roadAddress = candidate.roadAddress.trim()
  const location = roadAddress
    || [context.schoolName?.trim(), candidate.neighborhood.trim()].filter(Boolean).join(' ')

  return [candidate.name.trim(), location]
    .filter(Boolean)
    .join(' ')
}

export function toCampusEatsPublicPlace(
  candidate: CampusEatsCandidate,
  context: CampusEatsPlaceContext = {},
): PublicPlaceDto {
  const roadAddress = candidate.roadAddress.trim()

  return projectPublicPlace({
    placeRef: candidate.canonicalStoreId,
    snapshotRevision: CAMPUS_EATS_PLACE_FIXTURE_REVISION,
    displayName: candidate.name,
    category: publicCategory(candidate),
    areaLabel: candidate.neighborhood,
    address: roadAddress
      ? {
          road: roadAddress,
          evidence: candidate.coordinateStatus === 'search_verified' ? 'search-verified' : 'host-supplied',
          verifiedAt: null,
        }
      : null,
    coordinates: null,
    providerLinks: buildProviderSearchLinks(searchQuery(candidate, context)),
  })
}
