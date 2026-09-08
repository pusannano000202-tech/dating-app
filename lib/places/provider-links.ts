import {
  PLACE_LINK_KINDS,
  type PlaceLinkKind,
  type PlaceProvider,
  type PlaceProviderLink,
  type PlaceProviderLinks,
} from './contracts'

const PROVIDER_HOSTS: Readonly<Record<PlaceProvider, readonly string[]>> = Object.freeze({
  naver: Object.freeze(['map.naver.com', 'm.map.naver.com']),
  kakao: Object.freeze(['map.kakao.com', 'place.map.kakao.com']),
})

function isPlaceLinkKind(value: unknown): value is PlaceLinkKind {
  return typeof value === 'string' && PLACE_LINK_KINDS.some((kind) => kind === value)
}

export function isAllowedProviderUrl(provider: PlaceProvider, value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()

    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && (url.port === '' || url.port === '443')
      && PROVIDER_HOSTS[provider].includes(hostname)
  } catch {
    return false
  }
}

export function createProviderLink(
  provider: PlaceProvider,
  url: string,
  kind: PlaceLinkKind,
): PlaceProviderLink {
  if (!isPlaceLinkKind(kind)) {
    throw new TypeError('invalid_provider_link_kind')
  }
  if (!isAllowedProviderUrl(provider, url)) {
    throw new TypeError('invalid_provider_url')
  }

  return Object.freeze({ url: new URL(url).toString(), kind })
}

export function buildProviderSearchLinks(query: string): PlaceProviderLinks {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new TypeError('invalid_place_search_query')
  }

  const kakaoUrl = new URL('https://map.kakao.com/')
  kakaoUrl.searchParams.set('q', normalizedQuery)

  return Object.freeze({
    naver: createProviderLink(
      'naver',
      `https://map.naver.com/p/search/${encodeURIComponent(normalizedQuery)}`,
      'search',
    ),
    kakao: createProviderLink('kakao', kakaoUrl.toString(), 'search'),
  })
}
