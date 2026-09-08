export type CampusEatsTransientCoordinate = Readonly<{
  latitude: number
  longitude: number
}>

export type CampusEatsGeocodeQueueResult<TItem> = Readonly<{
  item: TItem
  coordinate: CampusEatsTransientCoordinate | null
}>

export async function resolveCampusEatsGeocodeQueue<TItem>({
  items,
  concurrency,
  resolveItem,
  onProgress,
  shouldCancel,
}: {
  items: readonly TItem[]
  concurrency: number
  resolveItem: (
    item: TItem,
    index: number,
  ) => Promise<CampusEatsTransientCoordinate | null>
  onProgress?: (settled: number, total: number) => void
  shouldCancel?: () => boolean
}): Promise<Array<CampusEatsGeocodeQueueResult<TItem>>> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError('invalid_geocode_concurrency')
  }

  const results = new Array<CampusEatsGeocodeQueueResult<TItem>>(items.length)
  let nextIndex = 0
  let settled = 0

  async function worker(): Promise<void> {
    while (true) {
      if (shouldCancel?.()) return
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      const item = items[index]
      let coordinate: CampusEatsTransientCoordinate | null = null
      try {
        coordinate = await resolveItem(item, index)
      } catch {
        coordinate = null
      }
      results[index] = Object.freeze({ item, coordinate })
      settled += 1
      onProgress?.(settled, items.length)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  for (let index = 0; index < items.length; index += 1) {
    results[index] ??= Object.freeze({ item: items[index], coordinate: null })
  }
  return results
}

export function createCampusEatsSharedPromiseCache<TValue>({
  concurrency = Number.MAX_SAFE_INTEGER,
  cancelledValue,
}: {
  concurrency?: number
  cancelledValue?: TValue
} = {}): (
  key: string,
  begin: () => Promise<TValue>,
  shouldCancel?: () => boolean,
) => Promise<TValue> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError('invalid_shared_request_concurrency')
  }

  type PendingRequest = {
    key: string
    begin: () => Promise<TValue>
    cancellationChecks: Array<() => boolean>
    promise: Promise<TValue>
    resolve: (value: TValue) => void
    reject: (reason: unknown) => void
  }

  const pendingByKey = new Map<string, PendingRequest>()
  const queue: PendingRequest[] = []
  let activeCount = 0

  const isStillNeeded = (request: PendingRequest) => request.cancellationChecks.some((check) => {
    try {
      return !check()
    } catch {
      return false
    }
  })

  const finish = (request: PendingRequest) => {
    activeCount -= 1
    if (pendingByKey.get(request.key) === request) pendingByKey.delete(request.key)
    pump()
  }

  function pump(): void {
    while (activeCount < concurrency && queue.length > 0) {
      const request = queue.shift()
      if (!request) return
      if (!isStillNeeded(request)) {
        if (pendingByKey.get(request.key) === request) pendingByKey.delete(request.key)
        request.resolve(cancelledValue as TValue)
        continue
      }

      activeCount += 1
      let operation: Promise<TValue>
      try {
        operation = Promise.resolve(request.begin())
      } catch (error) {
        operation = Promise.reject(error)
      }
      void operation.then(
        (value) => {
          finish(request)
          request.resolve(value)
        },
        (error: unknown) => {
          finish(request)
          request.reject(error)
        },
      )
    }
  }

  return (key, begin, shouldCancel = () => false) => {
    const pending = pendingByKey.get(key)
    if (pending) {
      pending.cancellationChecks.push(shouldCancel)
      return pending.promise
    }

    let resolveRequest: (value: TValue) => void = () => undefined
    let rejectRequest: (reason: unknown) => void = () => undefined
    const promise = new Promise<TValue>((resolve, reject) => {
      resolveRequest = resolve
      rejectRequest = reject
    })
    const request: PendingRequest = {
      key,
      begin,
      cancellationChecks: [shouldCancel],
      promise,
      resolve: resolveRequest,
      reject: rejectRequest,
    }
    pendingByKey.set(key, request)
    queue.push(request)
    pump()
    return promise
  }
}

export function resolveCampusEatsGeocodeWithTimeout(
  beginGeocode: (
    complete: (coordinate: CampusEatsTransientCoordinate | null) => void,
  ) => void,
  timeoutMs: number,
): Promise<CampusEatsTransientCoordinate | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('invalid_geocode_timeout')
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (coordinate: CampusEatsTransientCoordinate | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (
        coordinate
        && Number.isFinite(coordinate.latitude)
        && Number.isFinite(coordinate.longitude)
      ) {
        resolve(coordinate)
        return
      }
      resolve(null)
    }
    const timeout = setTimeout(() => finish(null), timeoutMs)

    try {
      beginGeocode(finish)
    } catch {
      finish(null)
    }
  })
}

export type CampusEatsMarkerBuildItem = Readonly<{
  candidateId: string
}>

export function buildCampusEatsMarkers<
  TItem extends CampusEatsMarkerBuildItem,
  TMarker,
  TListenerHandle,
>({
  items,
  createMarker,
  addClickListener,
  detachMarker,
  onSelect,
}: {
  items: readonly TItem[]
  createMarker: (item: TItem) => TMarker
  addClickListener: (marker: TMarker, listener: () => void) => TListenerHandle
  detachMarker: (marker: TMarker) => void
  onSelect: (candidateId: string) => void
}): Readonly<{
  markers: ReadonlyMap<string, TMarker>
  listenerHandles: readonly TListenerHandle[]
  resolvedCandidateIds: readonly string[]
  failedCandidateIds: readonly string[]
}> {
  const markers = new Map<string, TMarker>()
  const listenerHandles: TListenerHandle[] = []
  const resolvedCandidateIds: string[] = []
  const failedCandidateIds: string[] = []

  for (const item of items) {
    let marker: TMarker | null = null
    try {
      marker = createMarker(item)
      const listenerHandle = addClickListener(marker, () => onSelect(item.candidateId))
      markers.set(item.candidateId, marker)
      listenerHandles.push(listenerHandle)
      resolvedCandidateIds.push(item.candidateId)
    } catch {
      if (marker !== null) detachMarker(marker)
      failedCandidateIds.push(item.candidateId)
    }
  }

  return Object.freeze({
    markers,
    listenerHandles: Object.freeze(listenerHandles),
    resolvedCandidateIds: Object.freeze(resolvedCandidateIds),
    failedCandidateIds: Object.freeze(failedCandidateIds),
  })
}

export function removeCampusEatsMarkerListeners<TListenerHandle>(
  listenerHandles: readonly TListenerHandle[],
  removeListener: (listenerHandle: TListenerHandle) => void,
): void {
  for (const listenerHandle of listenerHandles) {
    try {
      removeListener(listenerHandle)
    } catch {
      // A stale provider handle must not prevent the remaining listeners from cleanup.
    }
  }
}
