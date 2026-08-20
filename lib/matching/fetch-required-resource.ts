export interface RequiredMatchingResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

type RequiredMatchingFetcher<T extends RequiredMatchingResponse> = (path: string) => Promise<T>
type Pause = (milliseconds: number) => Promise<void>

const TRANSIENT_STATUS = new Set([500, 502, 503, 504])

export async function fetchRequiredMatchingResource<T extends RequiredMatchingResponse>(
  path: string,
  fetcher: RequiredMatchingFetcher<T>,
  pause: Pause = wait,
): Promise<T> {
  const first = await fetcher(path)
  if (!TRANSIENT_STATUS.has(first.status)) return first

  await pause(180)
  return fetcher(path)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
