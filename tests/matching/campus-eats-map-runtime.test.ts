import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCampusEatsMarkers,
  removeCampusEatsMarkerListeners,
  resolveCampusEatsGeocodeQueue,
  resolveCampusEatsGeocodeWithTimeout,
} from '../../lib/campus-eats/map-runtime'
import { summarizeCampusEatsMapCoverage } from '../../lib/campus-eats/place-adapter'

test('a timed-out geocode preserves earlier results and does not block later candidates', async () => {
  const geocodeAttempts = [
    (complete: (coordinate: { latitude: number; longitude: number } | null) => void) => {
      complete({ latitude: 35.23, longitude: 129.08 })
    },
    () => undefined,
    (complete: (coordinate: { latitude: number; longitude: number } | null) => void) => {
      complete({ latitude: 35.24, longitude: 129.09 })
    },
  ]
  const resolvedCandidateIds: string[] = []
  const startedAt = Date.now()

  for (const [index, beginGeocode] of geocodeAttempts.entries()) {
    const coordinate = await resolveCampusEatsGeocodeWithTimeout(beginGeocode, 10)
    if (coordinate) resolvedCandidateIds.push(`candidate-${index + 1}`)
  }

  assert.deepEqual(resolvedCandidateIds, ['candidate-1', 'candidate-3'])
  const coverage = summarizeCampusEatsMapCoverage(
    ['candidate-1', 'candidate-2', 'candidate-3'],
    resolvedCandidateIds,
  )
  assert.equal(coverage.markerCount, 2)
  assert.equal(coverage.unresolvedCount, 1)
  assert.equal(coverage.state, 'partial')
  assert.ok(Date.now() - startedAt < 250, 'timeout must stay locally bounded')
})

test('coverage counts only interactive markers and an actual registered click selects its candidate', () => {
  const selectedCandidateIds: string[] = []
  const clickListeners = new Map<string, () => void>()
  const detachedCandidateIds: string[] = []

  const result = buildCampusEatsMarkers({
    items: [
      { candidateId: 'candidate-a' },
      { candidateId: 'candidate-b' },
      { candidateId: 'candidate-c' },
    ],
    createMarker: ({ candidateId }) => {
      if (candidateId === 'candidate-b') throw new Error('provider marker failed')
      return { candidateId }
    },
    addClickListener: (marker, listener) => {
      if (marker.candidateId === 'candidate-c') throw new Error('provider listener failed')
      clickListeners.set(marker.candidateId, listener)
      return { candidateId: marker.candidateId }
    },
    detachMarker: (marker) => detachedCandidateIds.push(marker.candidateId),
    onSelect: (candidateId) => selectedCandidateIds.push(candidateId),
  })

  assert.deepEqual(result.resolvedCandidateIds, ['candidate-a'])
  assert.deepEqual(result.failedCandidateIds, ['candidate-b', 'candidate-c'])
  assert.deepEqual(detachedCandidateIds, ['candidate-c'])
  assert.equal(result.markers.size, 1)
  assert.equal(result.listenerHandles.length, 1)

  clickListeners.get('candidate-a')?.()
  assert.deepEqual(selectedCandidateIds, ['candidate-a'])

  const coverage = summarizeCampusEatsMapCoverage(
    ['candidate-a', 'candidate-b', 'candidate-c'],
    result.resolvedCandidateIds,
  )
  assert.equal(coverage.markerCount, 1)
  assert.equal(coverage.unresolvedCount, 2)
  assert.equal(coverage.markerCount + coverage.unresolvedCount, coverage.totalCandidateCount)
  assert.equal(coverage.state, 'partial')
})

test('listener cleanup attempts every retained provider handle even when one removal fails', () => {
  const removed: string[] = []

  removeCampusEatsMarkerListeners(['listener-a', 'listener-b', 'listener-c'], (listener) => {
    removed.push(listener)
    if (listener === 'listener-b') throw new Error('provider cleanup failed')
  })

  assert.deepEqual(removed, ['listener-a', 'listener-b', 'listener-c'])
})

test('geocoding runs with bounded concurrency and preserves candidate order', async () => {
  let active = 0
  let peak = 0
  const progress: Array<{ settled: number; total: number }> = []
  const items = ['a', 'b', 'c', 'd', 'e', 'f']

  const results = await resolveCampusEatsGeocodeQueue({
    items,
    concurrency: 3,
    async resolveItem(item, index) {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, index % 2 === 0 ? 4 : 1))
      active -= 1
      return item === 'd' ? null : { latitude: 35 + index, longitude: 129 + index }
    },
    onProgress(settled, total) {
      progress.push({ settled, total })
    },
  })

  assert.equal(peak, 3)
  assert.deepEqual(results.map((result) => result.item), items)
  assert.deepEqual(results.map((result) => result.coordinate !== null), [true, true, true, false, true, true])
  assert.deepEqual(progress.at(-1), { settled: 6, total: 6 })
})

test('a cancelled geocode queue never starts another candidate after active work settles', async () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f']
  const started: string[] = []
  const releases: Array<() => void> = []
  const progress: Array<{ settled: number; total: number }> = []
  let cancelled = false

  const resultPromise = resolveCampusEatsGeocodeQueue({
    items,
    concurrency: 2,
    shouldCancel: () => cancelled,
    async resolveItem(item, index) {
      started.push(item)
      if (index < 2) {
        await new Promise<void>((resolve) => releases.push(resolve))
      }
      return { latitude: 35 + index, longitude: 129 + index }
    },
    onProgress(settled, total) {
      progress.push({ settled, total })
    },
  } as Parameters<typeof resolveCampusEatsGeocodeQueue<string>>[0] & {
    shouldCancel: () => boolean
  })

  assert.deepEqual(started, ['a', 'b'])
  cancelled = true
  releases.splice(0).forEach((release) => release())

  const results = await resultPromise
  assert.deepEqual(started, ['a', 'b'])
  assert.deepEqual(results.map((result) => result.coordinate !== null), [true, true, false, false, false, false])
  assert.deepEqual(progress.at(-1), { settled: 2, total: 6 })
})

test('an in-flight address lookup is shared and is evicted after it settles', async () => {
  const runtime = await import('../../lib/campus-eats/map-runtime') as Record<string, unknown>
  assert.equal(typeof runtime.createCampusEatsSharedPromiseCache, 'function')

  const createCache = runtime.createCampusEatsSharedPromiseCache as <T>() => (
    key: string,
    begin: () => Promise<T>,
  ) => Promise<T>
  const resolveShared = createCache<{ latitude: number; longitude: number } | null>()
  let begins = 0
  let release: (value: { latitude: number; longitude: number } | null) => void = () => {
    throw new Error('shared geocode did not start')
  }
  const begin = () => {
    begins += 1
    return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      release = resolve
    })
  }

  const first = resolveShared('same-address', begin)
  const second = resolveShared('same-address', begin)
  assert.equal(begins, 1)
  release({ latitude: 35.23, longitude: 129.08 })
  assert.deepEqual(await Promise.all([first, second]), [
    { latitude: 35.23, longitude: 129.08 },
    { latitude: 35.23, longitude: 129.08 },
  ])

  const thirdPromise = resolveShared('same-address', async () => {
    begins += 1
    return null
  })
  assert.equal(await thirdPromise, null)
  assert.equal(begins, 2)
})

test('shared geocoding enforces one global provider limit and skips work cancelled while queued', async () => {
  const runtime = await import('../../lib/campus-eats/map-runtime') as Record<string, unknown>
  const createPool = runtime.createCampusEatsSharedPromiseCache as <T>(options: {
    concurrency: number
    cancelledValue: T
  }) => (
    key: string,
    begin: () => Promise<T>,
    shouldCancel?: () => boolean,
  ) => Promise<T>
  const resolveShared = createPool<{ latitude: number; longitude: number } | null>({
    concurrency: 2,
    cancelledValue: null,
  })
  const started: string[] = []
  const releases: Array<() => void> = []
  let active = 0
  let peak = 0
  let cancelThird = false
  const begin = (key: string) => async () => {
    started.push(key)
    active += 1
    peak = Math.max(peak, active)
    await new Promise<void>((resolve) => releases.push(resolve))
    active -= 1
    return { latitude: 35.23, longitude: 129.08 }
  }

  const first = resolveShared('address-a', begin('address-a'))
  const second = resolveShared('address-b', begin('address-b'))
  const third = resolveShared('address-c', begin('address-c'), () => cancelThird)
  assert.deepEqual(started, ['address-a', 'address-b'])
  assert.equal(peak, 2)

  cancelThird = true
  releases.splice(0).forEach((release) => release())
  assert.deepEqual(await Promise.all([first, second, third]), [
    { latitude: 35.23, longitude: 129.08 },
    { latitude: 35.23, longitude: 129.08 },
    null,
  ])
  assert.deepEqual(started, ['address-a', 'address-b'])
  assert.equal(peak, 2)
})
