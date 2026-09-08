'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicPlaceDto } from '@/lib/places/contracts'
import {
  detachNaverMarker,
  loadNaverMapsSdk,
  subscribeNaverMapsAuthFailure,
  type NaverMarkerLike,
} from '../../lib/places/naver-maps-sdk'
import PlaceLinks from './PlaceLinks'

type MapStatus = 'loading' | 'ready' | 'missing-key' | 'missing-coordinates' | 'error'

function fallbackTitle(status: MapStatus): string {
  if (status === 'loading') return '네이버 지도를 불러오는 중이에요'
  if (status === 'missing-key') return '지도 연결 전에도 장소를 확인할 수 있어요'
  if (status === 'missing-coordinates') return '확정 좌표가 아직 없어요'
  return '지도를 불러오지 못했어요'
}

function fallbackDetail(place: PublicPlaceDto): string {
  const hasAddress = place.address !== null
  const hasProviderLink = place.providerLinks.naver !== null || place.providerLinks.kakao !== null

  if (hasAddress && hasProviderLink) {
    return '주소와 외부 지도 링크는 계속 사용할 수 있어요.'
  }
  if (hasAddress) {
    return '상세 주소는 아래에서 확인할 수 있어요. 외부 지도 링크는 아직 준비되지 않았어요.'
  }
  if (hasProviderLink) {
    return '외부 지도 링크는 아래에서 사용할 수 있어요. 상세 주소는 아직 준비되지 않았어요.'
  }
  return '상세 주소와 외부 지도 링크는 아직 준비되지 않았어요.'
}

export default function PlaceMap({
  place,
  className = '',
}: {
  place: PublicPlaceDto
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<MapStatus>('loading')
  const apiKey = process.env.NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID?.trim() ?? ''
  const latitude = place.coordinates?.latitude
  const longitude = place.coordinates?.longitude

  useEffect(() => {
    let cancelled = false
    let authFailed = false
    let marker: NaverMarkerLike | null = null
    const handleAuthFailure = () => {
      authFailed = true
      if (!cancelled) setStatus('error')
    }

    if (latitude === undefined || longitude === undefined) {
      setStatus('missing-coordinates')
      return
    }
    if (!apiKey) {
      setStatus('missing-key')
      return
    }

    const unsubscribeAuthFailure = subscribeNaverMapsAuthFailure(handleAuthFailure)
    setStatus('loading')

    void loadNaverMapsSdk(apiKey)
      .then((maps) => {
        if (cancelled || authFailed || !containerRef.current) return
        const position = new maps.LatLng(latitude, longitude)
        const map = new maps.Map(containerRef.current, {
          center: position,
          zoom: 16,
          minZoom: 12,
          maxZoom: 19,
          zoomControl: true,
          zoomControlOptions: { position: maps.Position.RIGHT_CENTER },
          scaleControl: true,
          mapDataControl: false,
        })
        marker = new maps.Marker({ map, position, title: place.displayName })
        if (!authFailed) setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      unsubscribeAuthFailure()
      detachNaverMarker(marker)
    }
  }, [apiKey, latitude, longitude, place.displayName])

  const locationText = place.address?.road ?? place.areaLabel

  return (
    <section
      className={`overflow-hidden rounded-3xl border border-boot-hairline bg-white shadow-[0_16px_38px_rgba(41,35,33,0.08)] ${className}`.trim()}
      data-map-status={status}
      aria-label={`${place.displayName} 위치`}
    >
      <div className="relative min-h-[280px] bg-boot-soft">
        <div
          ref={containerRef}
          className="h-[280px] w-full"
          aria-label={`${place.displayName} 네이버 지도`}
        />

        {status !== 'ready' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-boot-soft p-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="max-w-sm">
              <h3 className="text-lg font-black text-boot-ink">{fallbackTitle(status)}</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
                {fallbackDetail(place)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="font-black text-boot-ink">{place.displayName}</h3>
          <p className="mt-1 text-sm font-medium text-boot-muted">{locationText}</p>
        </div>
        <PlaceLinks place={place} />
      </div>
    </section>
  )
}
