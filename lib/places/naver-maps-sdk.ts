export type NaverLatLngLike = { lat: () => number; lng: () => number }
export type NaverBoundsLike = { extend: (position: NaverLatLngLike) => void }
export type NaverMapLike = { fitBounds: (bounds: NaverBoundsLike) => void }
export type NaverMarkerIcon = { content: string; anchor?: unknown }
export type NaverMarkerLike = {
  setMap: (map: NaverMapLike | null) => void
  setIcon: (icon: NaverMarkerIcon) => void
}

/**
 * The Naver SDK can throw while React is tearing a map down if its internal
 * overlay state has already been disposed. Cleanup must never take down the
 * surrounding route, so all map surfaces detach markers through this guard.
 */
export function detachNaverMarker(marker: NaverMarkerLike | null): void {
  if (!marker) return

  try {
    marker.setMap(null)
  } catch {
    // Provider teardown failures are non-actionable once the view is unmounting.
  }
}

export type NaverGeocodeResponse = {
  v2?: { addresses?: Array<{ x: string; y: string }> }
}

export type NaverMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapLike
  LatLng: new (latitude: number, longitude: number) => NaverLatLngLike
  LatLngBounds: new () => NaverBoundsLike
  Marker: new (options: {
    map: NaverMapLike
    position: NaverLatLngLike
    icon?: NaverMarkerIcon
    title: string
  }) => NaverMarkerLike
  Point: new (x: number, y: number) => unknown
  Position: { RIGHT_CENTER: unknown }
  Event: {
    addListener: (target: NaverMarkerLike, eventName: string, listener: () => void) => void
    trigger?: (target: NaverMapLike, eventName: string) => void
  }
  Service: {
    Status: { OK: number }
    geocode: (
      options: { query: string },
      callback: (status: number, response: NaverGeocodeResponse | undefined) => void,
    ) => void
  }
}

type NaverMapsBrowserWindow = Window & {
  naver?: { maps?: Partial<NaverMapsApi> }
  navermap_authFailure?: () => void
}

type LoaderOptions = {
  timeoutMs?: number
}

const LEGACY_SDK_SCRIPT_SELECTOR = 'script[data-quantum-naver-maps]'
const BASE_SDK_SCRIPT_SELECTOR = 'script[data-quantum-naver-maps-base]'
const GEOCODER_SDK_SCRIPT_SELECTOR = 'script[data-quantum-naver-maps-geocoder]'
const MAPS_ORIGIN = 'https://oapi.map.naver.com'
const BASE_SDK_PATH = '/openapi/v3/maps.js'
const GEOCODER_SDK_PATH = '/openapi/v3/maps-geocoder.js'
const BASE_SDK_URL = 'https://oapi.map.naver.com/openapi/v3/maps.js'
const GEOCODER_SDK_URL = 'https://oapi.map.naver.com/openapi/v3/maps-geocoder.js'
const DEFAULT_TIMEOUT_MS = 10_000
const MIN_TIMEOUT_MS = 10
const MAX_TIMEOUT_MS = 30_000
const READINESS_POLL_MS = 10

const authFailureSubscribers = new Set<() => void>()
let sdkPromise: Promise<NaverMapsApi> | null = null
let pendingSdkKey: string | null = null
let activeSdkKey: string | null = null
let sdkInvalidated = false

function getBrowserWindow(): NaverMapsBrowserWindow | null {
  if (typeof window === 'undefined') return null
  return window as unknown as NaverMapsBrowserWindow
}

function dispatchAuthFailure(): void {
  sdkInvalidated = true
  activeSdkKey = null
  if (typeof document !== 'undefined') {
    try {
      markManagedScriptsFailed()
    } catch {
      // Subscriber delivery still needs to complete when the DOM is being torn down.
    }
  }

  for (const listener of [...authFailureSubscribers]) {
    try {
      listener()
    } catch {
      // One consumer must not prevent the remaining map surfaces from failing closed.
    }
  }
}

function installAuthFailureDispatcher(): void {
  const browserWindow = getBrowserWindow()
  if (browserWindow && browserWindow.navermap_authFailure !== dispatchAuthFailure) {
    browserWindow.navermap_authFailure = dispatchAuthFailure
  }
}

export function subscribeNaverMapsAuthFailure(listener: () => void): () => void {
  authFailureSubscribers.add(listener)
  installAuthFailureDispatcher()

  let subscribed = true
  return () => {
    if (!subscribed) return
    subscribed = false
    authFailureSubscribers.delete(listener)
  }
}

function getReadyMapsApi(): NaverMapsApi | null {
  const maps = getBaseMapsApi()
  if (
    !maps
    || typeof maps.Service?.geocode !== 'function'
    || !maps.Service.Status
  ) {
    return null
  }

  return maps as NaverMapsApi
}

function getBaseMapsApi(): Partial<NaverMapsApi> | null {
  const maps = getBrowserWindow()?.naver?.maps
  if (
    !maps
    || typeof maps.Map !== 'function'
    || typeof maps.LatLng !== 'function'
    || typeof maps.LatLngBounds !== 'function'
    || typeof maps.Marker !== 'function'
    || typeof maps.Point !== 'function'
    || !maps.Position
    || typeof maps.Event?.addListener !== 'function'
  ) {
    return null
  }

  return maps
}

function normalizeTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.floor(value)))
}

function markScriptFailed(script: HTMLScriptElement | null): void {
  if (!script) return
  script.dataset.quantumNaverMapsState = 'failed'
  script.remove()
}

function markManagedScriptsFailed(): void {
  const selectors = [
    LEGACY_SDK_SCRIPT_SELECTOR,
    BASE_SDK_SCRIPT_SELECTOR,
    GEOCODER_SDK_SCRIPT_SELECTOR,
  ]

  for (const selector of selectors) {
    markScriptFailed(document.querySelector<HTMLScriptElement>(selector))
  }
}

function isCompatibleBaseScript(script: HTMLScriptElement, key: string): boolean {
  if (script.dataset.quantumNaverMapsState === 'failed') return false

  try {
    const url = new URL(script.src)
    return url.origin === MAPS_ORIGIN
      && url.pathname === BASE_SDK_PATH
      && url.searchParams.get('ncpKeyId') === key
      && !url.searchParams.has('submodules')
  } catch {
    return false
  }
}

function isCompatibleGeocoderScript(script: HTMLScriptElement): boolean {
  if (script.dataset.quantumNaverMapsState === 'failed') return false

  try {
    const url = new URL(script.src)
    return url.origin === MAPS_ORIGIN
      && url.pathname === GEOCODER_SDK_PATH
      && url.search === ''
  } catch {
    return false
  }
}

export function loadNaverMapsSdk(key: string, options: LoaderOptions = {}): Promise<NaverMapsApi> {
  const normalizedKey = key.trim()
  if (!normalizedKey) return Promise.reject(new Error('naver_maps_key_required'))

  if (sdkPromise) {
    if (pendingSdkKey !== normalizedKey) {
      return Promise.reject(new Error('naver_maps_key_conflict'))
    }
    return sdkPromise
  }

  if (typeof document === 'undefined' || !getBrowserWindow()) {
    return Promise.reject(new Error('naver_maps_browser_required'))
  }

  const readyMaps = sdkInvalidated ? null : getReadyMapsApi()
  if (readyMaps) {
    if (activeSdkKey !== null && activeSdkKey !== normalizedKey) {
      return Promise.reject(new Error('naver_maps_key_conflict'))
    }
    if (activeSdkKey === null) {
      const managedBase = document.querySelector<HTMLScriptElement>(BASE_SDK_SCRIPT_SELECTOR)
      if (!managedBase || !isCompatibleBaseScript(managedBase, normalizedKey)) {
        return Promise.reject(new Error('naver_maps_key_conflict'))
      }
    }
    activeSdkKey = normalizedKey
    return Promise.resolve(readyMaps)
  }

  let resolveSdk!: (maps: NaverMapsApi) => void
  let rejectSdk!: (error: Error) => void
  const pendingPromise = new Promise<NaverMapsApi>((resolve, reject) => {
    resolveSdk = resolve
    rejectSdk = reject
  })
  pendingSdkKey = normalizedKey
  sdkPromise = pendingPromise

  let settled = false
  let baseScript: HTMLScriptElement | null = null
  let geocoderScript: HTMLScriptElement | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeAuthFailure: () => void = () => undefined
  let baseLoadObserved = false
  let geocoderLoadObserved = false
  let baseRequiresLoad = false
  let geocoderRequiresLoad = false
  let geocoderStarted = false
  const requireReplacementLoad = sdkInvalidated

  const handleBaseLoad = () => {
    baseLoadObserved = true
    settleBaseIfReady()
  }
  const handleGeocoderLoad = () => {
    geocoderLoadObserved = true
    settleIfReady()
  }
  const handleBaseError = () => fail('naver_maps_sdk_failed')
  const handleGeocoderError = () => fail('naver_maps_sdk_failed')

  function cleanup(): void {
    if (pollTimer !== null) clearInterval(pollTimer)
    if (timeoutTimer !== null) clearTimeout(timeoutTimer)
    baseScript?.removeEventListener('load', handleBaseLoad)
    baseScript?.removeEventListener('error', handleBaseError)
    geocoderScript?.removeEventListener('load', handleGeocoderLoad)
    geocoderScript?.removeEventListener('error', handleGeocoderError)
    unsubscribeAuthFailure()
  }

  function succeed(maps: NaverMapsApi): void {
    if (settled) return
    settled = true
    if (baseScript) baseScript.dataset.quantumNaverMapsState = 'ready'
    if (geocoderScript) geocoderScript.dataset.quantumNaverMapsState = 'ready'
    cleanup()
    sdkInvalidated = false
    activeSdkKey = normalizedKey
    pendingSdkKey = null
    if (sdkPromise === pendingPromise) sdkPromise = null
    resolveSdk(maps)
  }

  function fail(code: string): void {
    if (settled) return
    settled = true
    cleanup()
    markManagedScriptsFailed()
    sdkInvalidated = true
    activeSdkKey = null
    pendingSdkKey = null
    if (sdkPromise === pendingPromise) sdkPromise = null
    rejectSdk(new Error(code))
  }

  function settleIfReady(): void {
    if (settled || !geocoderStarted || (geocoderRequiresLoad && !geocoderLoadObserved)) return
    const maps = getReadyMapsApi()
    if (maps) succeed(maps)
  }

  function startGeocoderPhase(): void {
    if (settled || geocoderStarted) return
    geocoderStarted = true

    if (!requireReplacementLoad) {
      const ready = getReadyMapsApi()
      if (ready) {
        succeed(ready)
        return
      }
    }

    const existing = document.querySelector<HTMLScriptElement>(GEOCODER_SDK_SCRIPT_SELECTOR)
    let shouldAppendScript = false
    if (!requireReplacementLoad && existing && isCompatibleGeocoderScript(existing)) {
      geocoderScript = existing
      geocoderLoadObserved = existing.dataset.quantumNaverMapsState === 'ready'
        || getReadyMapsApi() !== null
      geocoderRequiresLoad = !geocoderLoadObserved
    } else {
      if (existing) markScriptFailed(existing)
      geocoderScript = document.createElement('script')
      geocoderScript.dataset.quantumNaverMapsGeocoder = 'true'
      geocoderScript.dataset.quantumNaverMapsState = 'loading'
      geocoderScript.async = true
      geocoderScript.src = GEOCODER_SDK_URL
      geocoderRequiresLoad = true
      shouldAppendScript = true
    }

    geocoderScript.addEventListener('load', handleGeocoderLoad, { once: true })
    geocoderScript.addEventListener('error', handleGeocoderError, { once: true })
    if (shouldAppendScript) document.head.appendChild(geocoderScript)
    settleIfReady()
  }

  function settleBaseIfReady(): void {
    if (settled || geocoderStarted || (baseRequiresLoad && !baseLoadObserved)) return
    if (!getBaseMapsApi()) return
    if (baseScript) baseScript.dataset.quantumNaverMapsState = 'ready'
    startGeocoderPhase()
  }

  function pollReadiness(): void {
    if (geocoderStarted) settleIfReady()
    else settleBaseIfReady()
  }

  function startBasePhase(): void {
    const legacy = document.querySelector<HTMLScriptElement>(LEGACY_SDK_SCRIPT_SELECTOR)
    if (legacy) markScriptFailed(legacy)

    if (!requireReplacementLoad && getBaseMapsApi()) {
      const existingReadyBase = document.querySelector<HTMLScriptElement>(BASE_SDK_SCRIPT_SELECTOR)
      if (!existingReadyBase || !isCompatibleBaseScript(existingReadyBase, normalizedKey)) {
        fail('naver_maps_key_conflict')
        return
      }
      baseScript = existingReadyBase
      baseLoadObserved = true
      startGeocoderPhase()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(BASE_SDK_SCRIPT_SELECTOR)
    let shouldAppendScript = false
    if (!requireReplacementLoad && existing && isCompatibleBaseScript(existing, normalizedKey)) {
      baseScript = existing
      baseLoadObserved = existing.dataset.quantumNaverMapsState === 'ready'
        || getBaseMapsApi() !== null
      baseRequiresLoad = !baseLoadObserved
    } else {
      if (existing) markScriptFailed(existing)
      const staleGeocoder = document.querySelector<HTMLScriptElement>(GEOCODER_SDK_SCRIPT_SELECTOR)
      if (staleGeocoder) markScriptFailed(staleGeocoder)
      baseScript = document.createElement('script')
      baseScript.dataset.quantumNaverMapsBase = 'true'
      baseScript.dataset.quantumNaverMapsState = 'loading'
      baseScript.async = true
      baseScript.src = `${BASE_SDK_URL}?ncpKeyId=${encodeURIComponent(normalizedKey)}`
      baseRequiresLoad = true
      shouldAppendScript = true
    }

    baseScript.addEventListener('load', handleBaseLoad, { once: true })
    baseScript.addEventListener('error', handleBaseError, { once: true })
    if (shouldAppendScript) document.head.appendChild(baseScript)
    settleBaseIfReady()
  }

  unsubscribeAuthFailure = subscribeNaverMapsAuthFailure(() => fail('naver_maps_auth_failed'))

  try {
    pollTimer = setInterval(pollReadiness, READINESS_POLL_MS)
    timeoutTimer = setTimeout(
      () => fail('naver_maps_sdk_timed_out'),
      normalizeTimeout(options.timeoutMs),
    )
    startBasePhase()
  } catch {
    fail('naver_maps_sdk_failed')
  }

  return pendingPromise
}
