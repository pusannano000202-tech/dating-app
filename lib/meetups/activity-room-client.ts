// Bounded requests prevent a stalled local auth/RPC connection from leaving
// participation controls spinning indefinitely. No fallback counts are used.
export async function fetchActivityRoom(path: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(path, { ...init, cache: 'no-store', signal: controller.signal })
    const payload = await response.json().catch(() => null)
    return { ok: response.ok, payload }
  } finally { clearTimeout(timeout) }
}
