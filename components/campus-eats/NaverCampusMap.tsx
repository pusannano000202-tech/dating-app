'use client'

import { MapPinned, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CampusEatsCandidate } from '@/lib/campus-eats/fixtures/regional'

type LatLngLike = { lat: () => number; lng: () => number }
type MarkerLike = { setMap: (map: MapLike | null) => void; setIcon: (icon: MarkerIcon) => void }
type MapLike = { fitBounds: (bounds: BoundsLike) => void }
type BoundsLike = { extend: (position: LatLngLike) => void }
type MarkerIcon = { content: string; anchor?: unknown }

type GeocodeResponse = {
  v2?: { addresses?: Array<{ x: string; y: string }> }
}

type NaverMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapLike
  LatLng: new (latitude: number, longitude: number) => LatLngLike
  LatLngBounds: new () => BoundsLike
  Marker: new (options: { map: MapLike; position: LatLngLike; icon: MarkerIcon; title: string }) => MarkerLike
  Point: new (x: number, y: number) => unknown
  Position: { RIGHT_CENTER: unknown }
  Event: { addListener: (target: MarkerLike, eventName: string, listener: () => void) => void }
  Service: {
    Status: { OK: string }
    geocode: (
      options: { query: string },
      callback: (status: string, response: GeocodeResponse) => void,
    ) => void
  }
}

declare global {
  interface Window {
    naver: { maps: NaverMapsApi }
    navermap_authFailure?: () => void
  }
}

type MapStatus = 'loading' | 'ready' | 'missing-key' | 'error'

const coordinateCache = new Map<string, { latitude: number; longitude: number } | null>()
let sdkPromise: Promise<void> | null = null

function loadNaverMapsSdk(key: string) {
  if (typeof window !== 'undefined' && window.naver?.maps) return Promise.resolve()
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-quantum-naver-maps]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('naver_maps_sdk_failed')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.dataset.quantumNaverMaps = 'true'
    script.async = true
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}&submodules=geocoder`
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      sdkPromise = null
      reject(new Error('naver_maps_sdk_failed'))
    }
    document.head.appendChild(script)
  })

  return sdkPromise
}

function geocodeAddress(address: string) {
  const cached = coordinateCache.get(address)
  if (cached !== undefined) return Promise.resolve(cached)

  return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    window.naver.maps.Service.geocode({ query: address }, (status, response) => {
      const addressResult = response.v2?.addresses?.[0]
      if (status !== window.naver.maps.Service.Status.OK || !addressResult) {
        coordinateCache.set(address, null)
        resolve(null)
        return
      }

      const result = {
        latitude: Number(addressResult.y),
        longitude: Number(addressResult.x),
      }
      if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
        coordinateCache.set(address, null)
        resolve(null)
        return
      }

      coordinateCache.set(address, result)
      resolve(result)
    })
  })
}

function markerIcon(number: number, selected: boolean): MarkerIcon {
  const color = selected ? '#ff6258' : '#087f78'
  const size = selected ? 42 : 36
  return {
    content: `<button type="button" aria-label="후보 ${number} 지도 핀" style="width:${size}px;height:${size}px;border:3px solid white;border-radius:50% 50% 50% 10%;transform:rotate(-45deg);background:${color};color:white;font:800 14px system-ui;box-shadow:0 3px 12px rgba(23,59,58,.28)"><span style="display:block;transform:rotate(45deg)">${number}</span></button>`,
    anchor: new window.naver.maps.Point(size / 2, size),
  }
}

export default function NaverCampusMap({
  candidates,
  selectedCandidateId,
  onSelect,
}: {
  candidates: readonly CampusEatsCandidate[]
  selectedCandidateId: string | null
  onSelect: (candidateId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef(new Map<string, MarkerLike>())
  const onSelectRef = useRef(onSelect)
  const selectedCandidateIdRef = useRef(selectedCandidateId)
  const [status, setStatus] = useState<MapStatus>('loading')
  const [resolvedCount, setResolvedCount] = useState(0)
  const apiKey = process.env.NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID?.trim() ?? ''

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    selectedCandidateIdRef.current = selectedCandidateId
  }, [selectedCandidateId])

  useEffect(() => {
    let cancelled = false
    const markers = markerRefs.current
    markers.forEach((marker) => marker.setMap(null))
    markers.clear()
    setResolvedCount(0)

    if (!apiKey) {
      setStatus('missing-key')
      return
    }

    async function initializeMap() {
      try {
        setStatus('loading')
        window.navermap_authFailure = () => {
          if (!cancelled) setStatus('error')
        }
        await loadNaverMapsSdk(apiKey)
        if (cancelled || !containerRef.current || !window.naver?.maps) return

        const map = new window.naver.maps.Map(containerRef.current, {
          center: new window.naver.maps.LatLng(35.2336, 129.0796),
          zoom: 15,
          minZoom: 12,
          maxZoom: 19,
          zoomControl: true,
          zoomControlOptions: { position: window.naver.maps.Position.RIGHT_CENTER },
          scaleControl: true,
          mapDataControl: false,
        })
        const bounds = new window.naver.maps.LatLngBounds()
        let count = 0

        for (const candidate of candidates) {
          if (cancelled || candidate.coordinateStatus !== 'search_verified' || !candidate.roadAddress) continue
          const coordinate = await geocodeAddress(candidate.roadAddress)
          if (cancelled || !coordinate) continue

          const position = new window.naver.maps.LatLng(coordinate.latitude, coordinate.longitude)
          const marker = new window.naver.maps.Marker({
            map,
            position,
            icon: markerIcon(candidate.candidateNumber, candidate.id === selectedCandidateIdRef.current),
            title: candidate.name,
          })
          window.naver.maps.Event.addListener(marker, 'click', () => onSelectRef.current(candidate.id))
          markers.set(candidate.id, marker)
          bounds.extend(position)
          count += 1
        }

        if (count > 0) map.fitBounds(bounds)
        if (!cancelled) {
          setResolvedCount(count)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void initializeMap()
    return () => {
      cancelled = true
      window.navermap_authFailure = undefined
      markers.forEach((marker) => marker.setMap(null))
      markers.clear()
    }
  }, [apiKey, candidates])

  useEffect(() => {
    markerRefs.current.forEach((marker, candidateId) => {
      const candidate = candidates.find((item) => item.id === candidateId)
      if (candidate) marker.setIcon(markerIcon(candidate.candidateNumber, candidateId === selectedCandidateId))
    })
  }, [candidates, selectedCandidateId])

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden bg-[#e8f1ef]" data-map-status={status}>
      <div ref={containerRef} className="absolute inset-0" aria-label="부산대 캠퍼스 맛집 네이버 지도" />

      {status !== 'ready' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#e8f1ef] p-6 text-center">
          <div className="max-w-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#087f78] shadow-sm">
              {status === 'loading' ? <RefreshCw className="animate-spin" size={22} /> : <MapPinned size={22} />}
            </span>
            <h3 className="mt-4 text-lg font-black text-[#173b3a]">
              {status === 'loading' ? '네이버 지도를 불러오는 중이에요' : '네이버 지도 연결이 필요해요'}
            </h3>
            <p className="mt-2 text-sm font-bold leading-6 text-[#607875]">
              {status === 'missing-key'
                ? '지도 전용 키가 등록되면 실제 도로 지도와 확대·축소, 후보 핀이 여기에 표시됩니다.'
                : status === 'error'
                  ? '지도 인증 또는 네트워크 상태를 확인해 주세요. 후보 목록과 네이버 장소 링크는 계속 사용할 수 있습니다.'
                  : '검증된 주소를 실제 지도 좌표와 연결하고 있습니다.'}
            </p>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-white/95 px-3 py-2 text-xs font-black text-[#315a57] shadow-sm">
          확인 핀 {resolvedCount}/{candidates.length}
        </div>
      )}
    </div>
  )
}
