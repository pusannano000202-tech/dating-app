import assert from 'node:assert/strict'
import test from 'node:test'

type LoaderOptions = { timeoutMs?: number }

type SharedSdkModule = {
  loadNaverMapsSdk: (key: string, options?: LoaderOptions) => Promise<ReadyMapsApi>
  subscribeNaverMapsAuthFailure: (listener: () => void) => () => void
  detachNaverMarker: (marker: { setMap: (map: null) => void } | null) => void
}

type NaverServiceApi = {
  Status: { OK: string }
  geocode: (...args: unknown[]) => void
}

type BaseMapsApi = {
  Map: new (...args: unknown[]) => unknown
  LatLng: new (...args: unknown[]) => unknown
  LatLngBounds: new (...args: unknown[]) => unknown
  Marker: new (...args: unknown[]) => unknown
  Point: new (...args: unknown[]) => unknown
  Position: { RIGHT_CENTER: unknown }
  Event: { addListener: (...args: unknown[]) => void }
  Service?: NaverServiceApi
}

type ReadyMapsApi = BaseMapsApi & {
  Service: NaverServiceApi
}

type FakeBrowserWindow = {
  naver?: { maps?: BaseMapsApi }
  navermap_authFailure?: () => void
}

type EventName = 'load' | 'error'

class FakeScript {
  readonly dataset: Record<string, string | undefined> = {}
  async = false
  src = ''
  removed = false
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private readonly listeners = new Map<EventName, Set<() => void>>()

  constructor(private readonly owner: FakeDocument) {}

  addEventListener(type: EventName, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: EventName, listener: () => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  remove(): void {
    this.removed = true
    this.owner.remove(this)
  }

  dispatch(type: EventName): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener()
    if (type === 'load') this.onload?.()
    if (type === 'error') this.onerror?.()
  }
}

class FakeDocument {
  readonly createdScripts: FakeScript[] = []
  readonly head = {
    appendChild: (script: FakeScript) => {
      this.createdScripts.push(script)
      return script
    },
  }

  createElement(tagName: string): FakeScript {
    assert.equal(tagName, 'script')
    return new FakeScript(this)
  }

  querySelector(selector: string): FakeScript | null {
    if (selector.includes('quantum-naver-maps-base')) {
      return this.createdScripts.find((script) => (
        !script.removed && script.dataset.quantumNaverMapsBase === 'true'
      )) ?? null
    }
    if (selector.includes('quantum-naver-maps-geocoder')) {
      return this.createdScripts.find((script) => (
        !script.removed && script.dataset.quantumNaverMapsGeocoder === 'true'
      )) ?? null
    }
    return this.createdScripts.find((script) => (
      !script.removed && script.dataset.quantumNaverMaps === 'true'
    )) ?? null
  }

  remove(_script: FakeScript): void {
    // Keep the creation history so retry behavior remains observable.
  }
}

function createBaseMapsApi(): BaseMapsApi {
  class FakeMap {}
  class FakeLatLng {}
  class FakeBounds {}
  class FakeMarker {}
  class FakePoint {}

  return {
    Map: FakeMap,
    LatLng: FakeLatLng,
    LatLngBounds: FakeBounds,
    Marker: FakeMarker,
    Point: FakePoint,
    Position: { RIGHT_CENTER: 'right-center' },
    Event: { addListener: () => undefined },
  }
}

function createReadyMapsApi(): ReadyMapsApi {
  return {
    ...createBaseMapsApi(),
    Service: {
      Status: { OK: 'OK' },
      geocode: () => undefined,
    },
  }
}

function freshSdkModule(): SharedSdkModule {
  let modulePath: string | null = null
  try {
    modulePath = require.resolve('../../lib/places/naver-maps-sdk')
  } catch {
    // The RED phase intentionally reaches this branch before the shared loader exists.
  }

  if (modulePath === null) {
    assert.fail('shared Naver Maps SDK loader module must exist')
  }
  delete require.cache[modulePath]
  const sdk = require(modulePath) as Partial<SharedSdkModule>
  assert.equal(typeof sdk.loadNaverMapsSdk, 'function')
  assert.equal(typeof sdk.subscribeNaverMapsAuthFailure, 'function')
  assert.equal(typeof sdk.detachNaverMarker, 'function')
  return sdk as SharedSdkModule
}

test('marker cleanup never crashes the React tree when the provider rejects null detachment', () => {
  const sdk = freshSdkModule()
  assert.doesNotThrow(() => sdk.detachNaverMarker({
    setMap: () => { throw new TypeError('provider teardown failed') },
  }))
  assert.doesNotThrow(() => sdk.detachNaverMarker(null))
})

async function withFakeBrowser(
  run: (browser: { window: FakeBrowserWindow; document: FakeDocument }) => Promise<void>,
): Promise<void> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const fakeWindow: FakeBrowserWindow = {}
  const fakeDocument = new FakeDocument()

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: fakeWindow,
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: fakeDocument,
  })

  try {
    await run({ window: fakeWindow, document: fakeDocument })
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
}

test('shared loader loads base before geocoder and waits for Service.geocode readiness', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const first = sdk.loadNaverMapsSdk('client key', { timeoutMs: 250 })
    void first.catch(() => undefined)
    const concurrent = sdk.loadNaverMapsSdk('client key', { timeoutMs: 250 })

    assert.equal(first, concurrent)
    assert.equal(browser.document.createdScripts.length, 1)
    const baseScript = browser.document.createdScripts[0]
    const baseUrl = new URL(baseScript.src)
    assert.equal(baseScript.dataset.quantumNaverMapsBase, 'true')
    assert.equal(baseUrl.searchParams.get('ncpKeyId'), 'client key')
    assert.equal(baseUrl.searchParams.has('submodules'), false)

    let outcome = 'pending'
    void first.then(
      () => { outcome = 'resolved' },
      () => { outcome = 'rejected' },
    )
    baseScript.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(outcome, 'pending')
    assert.equal(browser.document.createdScripts.length, 1)

    browser.window.naver = { maps: createBaseMapsApi() }
    await new Promise<void>((resolve) => setTimeout(resolve, 20))

    assert.equal(browser.document.createdScripts.length, 2)
    const geocoderScript = browser.document.createdScripts[1]
    const geocoderUrl = new URL(geocoderScript.src)
    assert.equal(geocoderScript.dataset.quantumNaverMapsGeocoder, 'true')
    assert.equal(geocoderUrl.origin, 'https://oapi.map.naver.com')
    assert.equal(geocoderUrl.pathname, '/openapi/v3/maps-geocoder.js')
    assert.equal(geocoderUrl.search, '')

    browser.window.naver = { maps: createReadyMapsApi() }
    geocoderScript.dispatch('load')
    const maps = await first
    assert.equal(typeof maps.Service.geocode, 'function')
  })
})

test('concurrent calls never append duplicate geocoder scripts after base readiness', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const first = sdk.loadNaverMapsSdk('same-key', { timeoutMs: 250 })
    void first.catch(() => undefined)
    const concurrent = sdk.loadNaverMapsSdk('same-key', { timeoutMs: 250 })
    const baseScript = browser.document.createdScripts[0]

    browser.window.naver = { maps: createBaseMapsApi() }
    baseScript.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(first, concurrent)
    assert.equal(browser.document.createdScripts.length, 2)
    browser.window.naver = { maps: createReadyMapsApi() }
    browser.document.createdScripts[1].dispatch('load')
    await Promise.all([first, concurrent])
    assert.equal(browser.document.createdScripts.length, 2)
  })
})

test('a concurrent request with a different key fails closed without reusing the pending SDK', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const first = sdk.loadNaverMapsSdk('first-key', { timeoutMs: 250 })
    void first.catch(() => undefined)

    await assert.rejects(
      sdk.loadNaverMapsSdk('second-key', { timeoutMs: 250 }),
      /naver_maps_key_conflict/,
    )
    assert.equal(browser.document.createdScripts.length, 1)

    const baseScript = browser.document.createdScripts[0]
    browser.window.naver = { maps: createBaseMapsApi() }
    baseScript.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    browser.window.naver = { maps: createReadyMapsApi() }
    browser.document.createdScripts[1].dispatch('load')
    await assert.doesNotReject(first)
  })
})

test('a ready SDK cannot be silently reused for a different key', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const first = sdk.loadNaverMapsSdk('ready-key', { timeoutMs: 250 })
    const baseScript = browser.document.createdScripts[0]
    browser.window.naver = { maps: createBaseMapsApi() }
    baseScript.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    browser.window.naver = { maps: createReadyMapsApi() }
    browser.document.createdScripts[1].dispatch('load')
    await assert.doesNotReject(first)

    await assert.rejects(
      sdk.loadNaverMapsSdk('replacement-key', { timeoutMs: 250 }),
      /naver_maps_key_conflict/,
    )
    assert.equal(browser.document.createdScripts.length, 2)
  })
})

test('a fresh module rejects a ready managed SDK whose script belongs to another key', async () => {
  await withFakeBrowser(async (browser) => {
    const existingBase = browser.document.createElement('script')
    existingBase.dataset.quantumNaverMapsBase = 'true'
    existingBase.dataset.quantumNaverMapsState = 'ready'
    existingBase.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=old-key'
    browser.document.head.appendChild(existingBase)
    browser.window.naver = { maps: createReadyMapsApi() }

    const sdk = freshSdkModule()
    await assert.rejects(
      sdk.loadNaverMapsSdk('new-key', { timeoutMs: 250 }),
      /naver_maps_key_conflict/,
    )
    assert.equal(existingBase.removed, false)
    assert.equal(browser.document.createdScripts.length, 1)
  })
})

test('a fresh module rejects a base-only SDK whose managed script belongs to another key', async () => {
  await withFakeBrowser(async (browser) => {
    const existingBase = browser.document.createElement('script')
    existingBase.dataset.quantumNaverMapsBase = 'true'
    existingBase.dataset.quantumNaverMapsState = 'ready'
    existingBase.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=old-base-key'
    browser.document.head.appendChild(existingBase)
    browser.window.naver = { maps: createBaseMapsApi() }

    const sdk = freshSdkModule()
    await assert.rejects(
      sdk.loadNaverMapsSdk('new-base-key', { timeoutMs: 250 }),
      /naver_maps_key_conflict/,
    )
    assert.equal(existingBase.removed, true)
    assert.equal(browser.document.createdScripts.length, 1)
  })
})

test('a fresh module rejects an unowned base-only SDK instead of attaching geocoder', async () => {
  await withFakeBrowser(async (browser) => {
    browser.window.naver = { maps: createBaseMapsApi() }

    const sdk = freshSdkModule()
    await assert.rejects(
      sdk.loadNaverMapsSdk('unowned-base-key', { timeoutMs: 250 }),
      /naver_maps_key_conflict/,
    )
    assert.equal(browser.document.createdScripts.length, 0)
  })
})

test('a compatible ready base script is reused before one geocoder script is appended', async () => {
  await withFakeBrowser(async (browser) => {
    const baseScript = browser.document.createElement('script')
    baseScript.dataset.quantumNaverMapsBase = 'true'
    baseScript.dataset.quantumNaverMapsState = 'ready'
    baseScript.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=existing-key'
    browser.document.head.appendChild(baseScript)
    browser.window.naver = { maps: createBaseMapsApi() }

    const sdk = freshSdkModule()
    const pending = sdk.loadNaverMapsSdk('existing-key', { timeoutMs: 250 })
    void pending.catch(() => undefined)
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(baseScript.removed, false)
    assert.equal(browser.document.createdScripts.length, 2)
    assert.equal(browser.document.createdScripts[1].dataset.quantumNaverMapsGeocoder, 'true')

    browser.window.naver = { maps: createReadyMapsApi() }
    browser.document.createdScripts[1].dispatch('load')
    await assert.doesNotReject(pending)
  })
})

test('geocoder script failure invalidates both phases and a full sequential retry settles', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const first = sdk.loadNaverMapsSdk('geocoder-retry-key', { timeoutMs: 250 })
    void first.catch(() => undefined)
    const firstBase = browser.document.createdScripts[0]
    browser.window.naver = { maps: createBaseMapsApi() }
    firstBase.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    const firstGeocoder = browser.document.createdScripts[1]
    assert.ok(firstGeocoder)
    const rejected = assert.rejects(first, /naver_maps_sdk_failed/)
    firstGeocoder.dispatch('error')
    await rejected
    assert.equal(firstBase.removed || firstBase.dataset.quantumNaverMapsState === 'failed', true)
    assert.equal(firstGeocoder.removed || firstGeocoder.dataset.quantumNaverMapsState === 'failed', true)

    const retry = sdk.loadNaverMapsSdk('geocoder-retry-key', { timeoutMs: 250 })
    assert.equal(browser.document.createdScripts.length, 3)
    const retryBase = browser.document.createdScripts[2]
    browser.window.naver = { maps: createBaseMapsApi() }
    retryBase.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(browser.document.createdScripts.length, 4)
    const retryGeocoder = browser.document.createdScripts[3]
    browser.window.naver = { maps: createReadyMapsApi() }
    retryGeocoder.dispatch('load')
    await assert.doesNotReject(retry)
  })
})

test('script error rejects, marks or removes the failed script, and a retry settles', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const first = sdk.loadNaverMapsSdk('retry-key', { timeoutMs: 250 })
    const firstScript = browser.document.createdScripts[0]
    const rejected = assert.rejects(first, /naver_maps_sdk_failed/)

    firstScript.dispatch('error')
    await rejected
    assert.equal(
      firstScript.removed || firstScript.dataset.quantumNaverMapsState === 'failed',
      true,
    )

    const retry = sdk.loadNaverMapsSdk('retry-key', { timeoutMs: 250 })
    assert.equal(browser.document.createdScripts.length, 2)
    const retryBase = browser.document.createdScripts[1]
    browser.window.naver = { maps: createBaseMapsApi() }
    retryBase.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(browser.document.createdScripts.length, 3)
    const retryGeocoder = browser.document.createdScripts[2]
    browser.window.naver = { maps: createReadyMapsApi() }
    retryGeocoder.dispatch('load')

    await assert.doesNotReject(retry)
  })
})

test('one auth failure dispatcher notifies concurrent subscribers without clobbering them', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    let firstCount = 0
    let secondCount = 0
    const unsubscribeFirst = sdk.subscribeNaverMapsAuthFailure(() => { firstCount += 1 })
    const dispatcher = browser.window.navermap_authFailure
    const unsubscribeSecond = sdk.subscribeNaverMapsAuthFailure(() => { secondCount += 1 })

    assert.equal(typeof dispatcher, 'function')
    assert.equal(browser.window.navermap_authFailure, dispatcher)

    const pending = sdk.loadNaverMapsSdk('auth-key', { timeoutMs: 250 })
    const pendingScript = browser.document.createdScripts[0]
    const rejected = assert.rejects(pending, /naver_maps_auth_failed/)
    dispatcher?.()
    await rejected

    assert.equal(firstCount, 1)
    assert.equal(secondCount, 1)
    assert.equal(
      pendingScript.removed || pendingScript.dataset.quantumNaverMapsState === 'failed',
      true,
    )

    unsubscribeFirst()
    dispatcher?.()
    assert.equal(firstCount, 1)
    assert.equal(secondCount, 2)
    unsubscribeSecond()
  })
})

test('auth failure after readiness invalidates stale maps and makes replacement load observable', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const initial = sdk.loadNaverMapsSdk('auth-retry-key', { timeoutMs: 250 })
    const initialBase = browser.document.createdScripts[0]
    browser.window.naver = { maps: createReadyMapsApi() }
    initialBase.dispatch('load')
    await initial

    const dispatcher = browser.window.navermap_authFailure
    assert.equal(typeof dispatcher, 'function')
    dispatcher?.()

    const retry = sdk.loadNaverMapsSdk('auth-retry-key', { timeoutMs: 250 })
    assert.equal(browser.document.createdScripts.length, 2)
    let outcome = 'pending'
    void retry.then(
      () => { outcome = 'resolved' },
      () => { outcome = 'rejected' },
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(outcome, 'pending')

    browser.document.createdScripts[1].dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(browser.document.createdScripts.length, 3)
    assert.equal(outcome, 'pending')

    browser.document.createdScripts[2].dispatch('load')
    await assert.doesNotReject(retry)
  })
})

test('bounded timeout rejects an unready SDK and leaves the next attempt retryable', async () => {
  await withFakeBrowser(async (browser) => {
    const sdk = freshSdkModule()
    const timedOut = sdk.loadNaverMapsSdk('timeout-key', { timeoutMs: 20 })
    const timedOutScript = browser.document.createdScripts[0]

    await assert.rejects(timedOut, /naver_maps_sdk_timed_out/)
    assert.equal(
      timedOutScript.removed || timedOutScript.dataset.quantumNaverMapsState === 'failed',
      true,
    )

    const retry = sdk.loadNaverMapsSdk('timeout-key', { timeoutMs: 250 })
    assert.equal(browser.document.createdScripts.length, 2)
    const retryBase = browser.document.createdScripts[1]
    browser.window.naver = { maps: createBaseMapsApi() }
    retryBase.dispatch('load')
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.equal(browser.document.createdScripts.length, 3)
    const retryGeocoder = browser.document.createdScripts[2]
    browser.window.naver = { maps: createReadyMapsApi() }
    retryGeocoder.dispatch('load')

    await assert.doesNotReject(retry)
  })
})
