/** Only explicitly configured provider origins enter CSP; never interpolate raw env text. */
export function resolveVoiceConnectSources(env, production) {
  const sources = new Set()
  const values = [env.LIVEKIT_URL, ...(env.LIVEKIT_CONNECT_ORIGINS || '').split(',')]
  for (const value of values) {
    if (!value) continue
    try {
      if (/[\s;*]/.test(value.trim())) continue
      const url = new URL(value.trim())
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') continue
      const secure = url.protocol === 'wss:' || url.protocol === 'https:'
      const local = !production && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (!secure && !(local && ['ws:', 'http:'].includes(url.protocol))) continue
      sources.add(`${secure ? 'wss' : 'ws'}://${url.host}`)
      sources.add(`${secure ? 'https' : 'http'}://${url.host}`)
    } catch { /* Invalid configuration remains blocked. */ }
  }
  return [...sources]
}
