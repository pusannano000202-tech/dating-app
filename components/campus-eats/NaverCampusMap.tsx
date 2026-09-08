'use client'

import { MapPinned, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CampusEatsCandidate } from '@/lib/campus-eats/fixtures/regional'
import {
  classifyCampusEatsMapResolution,
  createCampusEatsMarkerClusters,
  createCampusEatsMarkerLayout,
  summarizeCampusEatsMapCoverage,
  toCampusEatsPublicPlace,
  type CampusEatsMapCoverage,
} from '@/lib/campus-eats/place-adapter'
import {
  buildCampusEatsMarkers,
  createCampusEatsSharedPromiseCache,
  removeCampusEatsMarkerListeners,
  resolveCampusEatsGeocodeQueue,
  resolveCampusEatsGeocodeWithTimeout,
} from '@/lib/campus-eats/map-runtime'
import {
  detachNaverMarker,
  loadNaverMapsSdk,
  subscribeNaverMapsAuthFailure,
  type NaverMapsApi,
  type NaverMarkerIcon,
  type NaverMarkerLike,
} from '../../lib/places/naver-maps-sdk'

export type CampusEatsMapStatus = 'loading' | 'complete' | 'partial' | 'missing-key' | 'missing-addresses' | 'unresolved-addresses' | 'error'

const coordinateCache = new Map<string, { latitude: number; longitude: number }>()
const resolveSharedGeocode = createCampusEatsSharedPromiseCache<{
  latitude: number
  longitude: number
} | null>({
  concurrency: 4,
  cancelledValue: null,
})
const CAMPUS_EATS_GEOCODE_TIMEOUT_MS = 5_000
const CAMPUS_EATS_GEOCODE_CONCURRENCY = 4

function geocodeAddress(
  address: string,
  maps: NaverMapsApi,
  shouldCancel: () => boolean,
) {
  const cached = coordinateCache.get(address)
  if (cached) return Promise.resolve(cached)

  return resolveSharedGeocode(address, () => (
    resolveCampusEatsGeocodeWithTimeout((complete) => {
      maps.Service.geocode({ query: address }, (status, response) => {
        const addressResult = response?.v2?.addresses?.[0]
        if (status !== maps.Service.Status.OK || !addressResult) {
          complete(null)
          return
        }

        const result = {
          latitude: Number(addressResult.y),
          longitude: Number(addressResult.x),
        }
        if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
          complete(null)
          return
        }

        coordinateCache.set(address, result)
        complete(result)
      })
    }, CAMPUS_EATS_GEOCODE_TIMEOUT_MS)
  ), shouldCancel)
}

type NaverMarkerListenerHandle = unknown

function markerEventApi(maps: NaverMapsApi): {
  addListener: (
    target: NaverMarkerLike,
    eventName: string,
    listener: () => void,
  ) => NaverMarkerListenerHandle
  removeListener?: (listener: NaverMarkerListenerHandle) => void
} {
  return maps.Event as unknown as ReturnType<typeof markerEventApi>
}

function removeMarkerListeners(
  maps: NaverMapsApi | null,
  listenerHandles: readonly NaverMarkerListenerHandle[],
): void {
  if (!maps) return
  const events = markerEventApi(maps)
  if (!events.removeListener) return
  removeCampusEatsMarkerListeners(
    listenerHandles.filter((listenerHandle) => listenerHandle !== undefined && listenerHandle !== null),
    (listenerHandle) => events.removeListener?.(listenerHandle),
  )
}

function markerIcon(
  maps: NaverMapsApi,
  label: string,
  selected: boolean,
  clustered = false,
): NaverMarkerIcon {
  const color = selected ? '#ff6258' : '#087f78'
  const size = selected ? 46 : clustered ? 42 : 36
  const ariaLabel = clustered ? `가까운 후보 ${label} 지도 핀` : `후보 ${label} 지도 핀`
  return {
    content: `<button type="button" aria-label="${ariaLabel}" style="width:${size}px;height:${size}px;border:3px solid white;border-radius:50% 50% 50% 10%;transform:rotate(-45deg);background:${color};color:white;font:800 ${clustered ? 11 : 14}px system-ui;box-shadow:0 3px 12px rgba(23,59,58,.28)"><span style="display:block;transform:rotate(45deg)">${label}</span></button>`,
    anchor: new maps.Point(size / 2, size),
  }
}

type MarkerClusterReference = Readonly<{
  marker: NaverMarkerLike
  candidateIds: readonly string[]
  candidateNumbers: readonly number[]
}>

export default function NaverCampusMap({
  schoolName,
  candidates,
  selectedCandidateId,
  onSelect,
  onCoverageChange,
  onStatusChange,
}: {
  schoolName: string
  candidates: readonly CampusEatsCandidate[]
  selectedCandidateId: string | null
  onSelect: (candidateId: string) => void
  onCoverageChange?: (coverage: CampusEatsMapCoverage) => void
  onStatusChange?: (status: CampusEatsMapStatus) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<string, MarkerClusterReference>())
  const mapsApiRef = useRef<NaverMapsApi | null>(null)
  const onSelectRef = useRef(onSelect)
  const onCoverageChangeRef = useRef(onCoverageChange)
  const onStatusChangeRef = useRef(onStatusChange)
  const selectedCandidateIdRef = useRef(selectedCandidateId)
  const [status, setStatus] = useState<CampusEatsMapStatus>('loading')
  const [coverage, setCoverage] = useState<CampusEatsMapCoverage>(() => (
    summarizeCampusEatsMapCoverage(candidates.map((candidate) => candidate.id), [])
  ))
  const [overlappingCandidateCount, setOverlappingCandidateCount] = useState(0)
  const [activeClusterCandidateIds, setActiveClusterCandidateIds] = useState<readonly string[]>([])
  const [geocodeProgress, setGeocodeProgress] = useState({ settled: 0, total: 0 })
  const [retryRevision, setRetryRevision] = useState(0)
  const [recentSelectedCandidateId, setRecentSelectedCandidateId] = useState<string | null>(null)
  const apiKey = process.env.NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID?.trim() ?? ''
  const activeClusterCandidates = activeClusterCandidateIds.flatMap((candidateId) => {
    const candidate = candidates.find((item) => item.id === candidateId)
    return candidate ? [candidate] : []
  })
  const recentSelectedCandidate = candidates.find((candidate) => candidate.id === recentSelectedCandidateId) ?? null
  const publishStatus = useCallback((nextStatus: CampusEatsMapStatus) => {
    setStatus(nextStatus)
    onStatusChangeRef.current?.(nextStatus)
  }, [])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    onCoverageChangeRef.current = onCoverageChange
  }, [onCoverageChange])

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    selectedCandidateIdRef.current = selectedCandidateId
  }, [selectedCandidateId])

  useEffect(() => {
    let cancelled = false
    let authFailed = false
    let resizeObserver: ResizeObserver | null = null
    let mapsForCleanup: NaverMapsApi | null = null
    let containerForCleanup: HTMLDivElement | null = null
    let markerListenerHandles: readonly NaverMarkerListenerHandle[] = []
    const markers = markerRefs.current
    markers.forEach(({ marker }) => detachNaverMarker(marker))
    markers.clear()
    containerRef.current?.replaceChildren()
    mapsApiRef.current = null
    setOverlappingCandidateCount(0)
    setActiveClusterCandidateIds([])
    setRecentSelectedCandidateId(null)
    publishStatus('loading')

    const publishCoverage = (resolvedCandidateIds: readonly string[]) => {
      const nextCoverage = summarizeCampusEatsMapCoverage(
        candidates.map((candidate) => candidate.id),
        resolvedCandidateIds,
      )
      setCoverage(nextCoverage)
      onCoverageChangeRef.current?.(nextCoverage)
      return nextCoverage
    }

    publishCoverage([])

    const addressCandidates = candidates.flatMap((candidate) => {
      const place = toCampusEatsPublicPlace(candidate, { schoolName })
      const address = place.address?.road
      return address ? [{ candidate, address }] : []
    })
    setGeocodeProgress({ settled: 0, total: addressCandidates.length })

    if (classifyCampusEatsMapResolution(addressCandidates.length, 0) === 'missing-addresses') {
      publishStatus('missing-addresses')
      return
    }

    if (!apiKey) {
      publishStatus('missing-key')
      return
    }

    const unsubscribeAuthFailure = subscribeNaverMapsAuthFailure(() => {
      authFailed = true
      if (!cancelled) publishStatus('error')
    })

    async function initializeMap() {
      try {
        publishStatus('loading')
        const maps = await loadNaverMapsSdk(apiKey)
        if (cancelled || authFailed) return
        mapsApiRef.current = maps
        mapsForCleanup = maps

        const geocodeResults = await resolveCampusEatsGeocodeQueue({
          items: addressCandidates,
          concurrency: CAMPUS_EATS_GEOCODE_CONCURRENCY,
          shouldCancel: () => cancelled || authFailed,
          resolveItem: ({ address }) => geocodeAddress(address, maps, () => cancelled || authFailed),
          onProgress: (settled, total) => {
            if (!cancelled && !authFailed) setGeocodeProgress({ settled, total })
          },
        })
        if (cancelled || authFailed) return
        const resolvedCandidates = geocodeResults.flatMap(({ item, coordinate }) => (
          coordinate ? [{ candidate: item.candidate, coordinate }] : []
        ))

        const resolutionStatus = classifyCampusEatsMapResolution(
          addressCandidates.length,
          resolvedCandidates.length,
        )
        if (resolutionStatus !== 'ready') {
          if (!cancelled && !authFailed) publishStatus(resolutionStatus)
          return
        }
        const mapContainer = containerRef.current
        if (!mapContainer) return
        containerForCleanup = mapContainer

        const markerLayout = createCampusEatsMarkerLayout(resolvedCandidates.map(({ candidate, coordinate }) => ({
          candidateId: candidate.id,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        })))
        const candidateById = new Map(resolvedCandidates.map(({ candidate }) => [candidate.id, candidate]))
        const markerClusters = createCampusEatsMarkerClusters(markerLayout.map((marker) => ({
          candidateId: marker.candidateId,
          latitude: marker.latitude,
          longitude: marker.longitude,
        })))
        setOverlappingCandidateCount(
          markerClusters.reduce((sum, cluster) => sum + (cluster.requiresPicker ? cluster.candidateCount : 0), 0),
        )

        const firstCoordinate = markerClusters[0]
        mapContainer.replaceChildren()
        const map = new maps.Map(mapContainer, {
          center: new maps.LatLng(firstCoordinate.latitude, firstCoordinate.longitude),
          zoom: 15,
          minZoom: 12,
          maxZoom: 19,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.RIGHT_CENTER },
          scaleControl: true,
          mapDataControl: false,
        })
        const bounds = new maps.LatLngBounds()

        const markerItems = markerClusters.flatMap((cluster) => {
          const clusterCandidates = cluster.candidateIds.flatMap((candidateId) => {
            const candidate = candidateById.get(candidateId)
            return candidate ? [candidate] : []
          })
          return clusterCandidates.length === cluster.candidateIds.length
            ? [{ candidateId: cluster.clusterId, cluster, clusterCandidates }]
            : []
        })
        const events = markerEventApi(maps)
        const markerBuild = buildCampusEatsMarkers({
          items: markerItems,
          createMarker: ({ cluster, clusterCandidates }) => {
            const position = new maps.LatLng(
              cluster.latitude,
              cluster.longitude,
            )
            const candidateNumbers = clusterCandidates.map((candidate) => candidate.candidateNumber)
            const clustered = cluster.requiresPicker
            const label = clustered
              ? `${cluster.candidateCount}곳`
              : String(candidateNumbers[0])
            return {
              marker: new maps.Marker({
                map,
                position,
                icon: markerIcon(
                  maps,
                  label,
                  cluster.candidateIds.includes(selectedCandidateIdRef.current ?? ''),
                  clustered,
                ),
                title: clustered
                  ? `가까이 붙은 후보 ${cluster.candidateCount}곳 · 눌러서 정확히 선택`
                  : clusterCandidates[0].name,
              }),
              position,
              candidateIds: cluster.candidateIds,
              candidateNumbers,
            }
          },
          addClickListener: ({ marker }, listener) => events.addListener(marker, 'click', listener),
          detachMarker: ({ marker }) => detachNaverMarker(marker),
          onSelect: (clusterId) => {
            const cluster = markerClusters.find((item) => item.clusterId === clusterId)
            if (!cluster) return
          if (cluster.requiresPicker) {
            setActiveClusterCandidateIds(cluster.candidateIds)
            return
          }
            const candidateId = cluster.candidateIds[0]
            setRecentSelectedCandidateId(candidateId)
            onSelectRef.current(candidateId)
          },
        })
        markerBuild.markers.forEach(({ marker, position, candidateIds, candidateNumbers }, clusterId) => {
          markers.set(clusterId, { marker, candidateIds, candidateNumbers })
          bounds.extend(position)
        })
        markerListenerHandles = markerBuild.listenerHandles
        const successfulClusterIds = new Set(markerBuild.resolvedCandidateIds)
        const resolvedMarkerCandidateIds = markerClusters
          .filter((cluster) => successfulClusterIds.has(cluster.clusterId))
          .flatMap((cluster) => cluster.candidateIds)
        const nextCoverage = publishCoverage(resolvedMarkerCandidateIds)
        if (
          markerBuild.resolvedCandidateIds.length === 0
          && markerBuild.failedCandidateIds.length > 0
        ) {
          if (!cancelled && !authFailed) publishStatus('error')
          return
        }

        const fitVisibleMap = () => {
          const container = containerForCleanup
          if (cancelled || !container || container.clientWidth === 0 || container.clientHeight === 0) return
          maps.Event.trigger?.(map, 'resize')
          map.fitBounds(bounds)
        }

        fitVisibleMap()
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(fitVisibleMap)
          })
          resizeObserver.observe(mapContainer)
        }
        if (!cancelled && !authFailed) {
          publishStatus(nextCoverage.state === 'complete' ? 'complete' : 'partial')
        }
      } catch {
        if (!cancelled) publishStatus('error')
      }
    }

    void initializeMap()
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      unsubscribeAuthFailure()
      removeMarkerListeners(mapsForCleanup, markerListenerHandles)
      markers.forEach(({ marker }) => detachNaverMarker(marker))
      markers.clear()
      containerForCleanup?.replaceChildren()
      mapsApiRef.current = null
    }
  }, [apiKey, candidates, publishStatus, retryRevision, schoolName])

  useEffect(() => {
    const maps = mapsApiRef.current
    if (!maps) return
    markerRefs.current.forEach(({ marker, candidateIds, candidateNumbers }) => {
      const clustered = candidateIds.length > 1
      marker.setIcon(markerIcon(
        maps,
        clustered ? `${candidateIds.length}곳` : String(candidateNumbers[0]),
        candidateIds.includes(selectedCandidateId ?? ''),
        clustered,
      ))
    })
  }, [candidates, selectedCandidateId])

  return (
    <div
      className="flex h-full min-h-[360px] flex-col overflow-hidden bg-[#e8f1ef]"
      data-map-status={status}
      data-coordinate-source="transient-address-geocode"
    >
      <div className="relative min-h-[300px] flex-1">
        <div
          ref={containerRef}
          className="h-full w-full"
          aria-label={`${schoolName} 캠퍼스 맛집 네이버 지도`}
          aria-describedby="campus-eats-map-coordinate-note"
        />
        {status !== 'complete' && status !== 'partial' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-[#e8f1ef] p-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="max-w-sm">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#087f78] shadow-sm">
                {status === 'loading' ? <RefreshCw className="animate-spin" size={22} /> : <MapPinned size={22} />}
              </span>
              <h3 className="mt-4 text-lg font-black text-[#173b3a]">
                {status === 'loading'
                  ? '네이버 지도를 불러오는 중이에요'
                  : status === 'missing-addresses'
                    ? '지도에 표시할 주소가 아직 없어요'
                    : status === 'unresolved-addresses'
                    ? '주소 기반 핀을 만들지 못했어요'
                      : status === 'error'
                        ? '지도를 불러오지 못했어요'
                        : '네이버 지도 연결이 필요해요'}
              </h3>
              <p className="mt-2 text-sm font-bold leading-6 text-[#607875]">
                {status === 'missing-key'
                  ? '지도 전용 키가 등록되면 실제 도로 지도와 확대·축소, 후보 핀이 여기에 표시됩니다.'
                  : status === 'missing-addresses'
                    ? '확인할 도로명 주소가 아직 없어요. 후보 목록의 외부 지도 검색 링크로 위치를 확인해 주세요.'
                    : status === 'unresolved-addresses'
                      ? `후보 ${coverage.unresolvedCount}곳의 주소를 지도 핀으로 바꾸지 못했어요. 외부 지도 검색 링크는 계속 사용할 수 있습니다.`
                      : status === 'error'
                        ? `지도 연결을 완료하지 못했습니다. 위치 미확인 ${coverage.unresolvedCount}곳은 외부 지도 검색 링크로 확인할 수 있습니다.`
                        : `후보 주소를 지도에서 확인하고 있습니다. 주소 확인 ${geocodeProgress.settled}/${geocodeProgress.total}`}
              </p>
              {(status === 'unresolved-addresses' || status === 'error') && (
                <button
                  type="button"
                  data-ui="campus-eats-map-retry"
                  onClick={() => setRetryRevision((revision) => revision + 1)}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087f78] px-4 text-sm font-black text-white"
                >
                  <RefreshCw size={16} /> 지도 다시 시도
                </button>
              )}
            </div>
          </div>
        )}
        {activeClusterCandidates.length > 1 ? (
          <section
            className="absolute inset-x-3 bottom-3 z-20 max-h-[52%] overflow-y-auto rounded-2xl border border-[#c9ddd8] bg-white/96 p-3 shadow-[0_16px_40px_rgba(23,59,58,0.22)] backdrop-blur"
            aria-label="가까이 붙은 지도 후보 선택"
            data-ui="campus-eats-cluster-picker"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-[#087f78]">가까이 붙은 후보 {activeClusterCandidates.length}곳</p>
                <p className="mt-0.5 text-sm font-black text-[#173b3a]">후보를 정확히 골라 주세요</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveClusterCandidateIds([])}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef7f5] text-[#315a57]"
                aria-label="가까운 후보 목록 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {activeClusterCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    setRecentSelectedCandidateId(candidate.id)
                    onSelectRef.current(candidate.id)
                    setActiveClusterCandidateIds([])
                  }}
                  className="flex min-h-12 items-center gap-3 rounded-xl border border-[#dce9e6] bg-[#f8fcfb] px-3 py-2 text-left hover:border-[#087f78]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#087f78] text-xs font-black text-white">
                    {candidate.candidateNumber}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-[#173b3a]">{candidate.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold text-[#607875]">{candidate.roadAddress}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {recentSelectedCandidate ? (
        <div
          data-ui="campus-eats-map-selection-caption"
          className="shrink-0 border-t border-[#b9d3ce] bg-[#f4fbf9] px-3 py-2 text-[#173b3a]"
          role="status"
          aria-live="polite"
        >
          <p className="text-[10px] font-black text-[#087f78]">
            후보 {String(recentSelectedCandidate.candidateNumber).padStart(2, '0')} 선택
          </p>
          <p className="mt-0.5 truncate text-sm font-black">{recentSelectedCandidate.name}</p>
        </div>
      ) : null}
      <p id="campus-eats-map-coordinate-note" className="sr-only">
        후보 주소를 지도에서 검색해 현재 화면에만 임시 핀으로 표시합니다.
      </p>
      <div className="border-t border-[#cadbd7] bg-white px-3 py-2.5 text-[#315a57]" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-black">
            {status === 'complete'
              ? '전체 위치 표시 완료 · 주소 검색 기반 임시 핀'
              : status === 'partial'
                ? <>일부 위치 표시 실패 · 실패 {coverage.unresolvedCount}곳</>
                : '위치 정보 준비 중'}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-black">
              위치 확인 {coverage.markerCount} + 위치 미확인 {coverage.unresolvedCount} = 후보 {coverage.totalCandidateCount}
            </p>
            {status === 'partial' ? (
              <button
                type="button"
                data-ui="campus-eats-map-retry"
                onClick={() => setRetryRevision((revision) => revision + 1)}
                className="min-h-9 shrink-0 rounded-lg bg-[#e4f2ef] px-2.5 text-[11px] font-black text-[#087f78]"
              >
                다시 시도
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-1 text-[10px] font-bold leading-4 text-[#607875]">
          위치가 확인되지 않은 후보는 지도 핀으로 만들지 않습니다. 가까운 위치는 한 핀으로 묶고, 그 핀을 누르면 후보 이름과 번호를 정확히 고를 수 있어요.
          {overlappingCandidateCount > 0 ? ` · 가까운 후보 묶음 대상 ${overlappingCandidateCount}곳` : ''}
        </p>
      </div>
    </div>
  )
}
