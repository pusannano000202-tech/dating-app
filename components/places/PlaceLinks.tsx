import type { PlaceProviderLink, PublicPlaceDto } from '@/lib/places/contracts'

function linkLabel(providerLabel: string, link: PlaceProviderLink): string {
  return link.kind === 'place' ? `${providerLabel}에서 장소 보기` : `${providerLabel}에서 장소 검색`
}

export default function PlaceLinks({
  place,
  className = '',
}: {
  place: PublicPlaceDto
  className?: string
}) {
  const links = [
    { provider: '네이버 지도', link: place.providerLinks.naver },
    { provider: '카카오맵', link: place.providerLinks.kakao },
  ].filter((item): item is { provider: string; link: PlaceProviderLink } => item.link !== null)

  if (links.length === 0) return null

  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`.trim()}
      role="group"
      aria-label={`${place.displayName} 외부 지도 링크`}
    >
      {links.map(({ provider, link }) => (
        <a
          key={provider}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${linkLabel(provider, link)} (새 창)`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-boot-hairline bg-white px-4 py-2 text-sm font-black text-boot-primary shadow-sm transition hover:border-boot-primary/45 hover:bg-boot-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2"
        >
          {linkLabel(provider, link)}
        </a>
      ))}
    </div>
  )
}
