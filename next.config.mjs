import { resolveVoiceConnectSources } from './lib/voice/security-headers.mjs'

const isProduction = process.env.NODE_ENV === 'production'
const voiceConnections = resolveVoiceConnectSources(process.env, isProduction).map(origin => ` ${origin}`).join('')
const defaultDistDir = isProduction ? '.next' : '.next-dev'
function getLocalSupabaseOrigin() {
  if (isProduction) return null
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    if (
      url.protocol !== 'http:'
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !url.port
      || url.username || url.password || url.search || url.hash
      || url.pathname !== '/'
    ) return null
    return url
  } catch {
    return null
  }
}
const localSupabaseUrl = getLocalSupabaseOrigin()
const localSupabaseImages = localSupabaseUrl ? ` ${localSupabaseUrl.origin}` : ''
const localSupabaseConnections = localSupabaseUrl
  ? ` ${localSupabaseUrl.origin} ws://${localSupabaseUrl.host}`
  : ''
const naverMapsRuntimeScriptSources = isProduction
  ? ' https://nrbe.pstatic.net'
  : ' http://oapi.map.naver.com http://nrbe.map.naver.net'
const naverMapsRuntimeImageSources = isProduction
  ? ''
  : ' http://static.naver.net http://nrbe.map.naver.net'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://oapi.map.naver.com${naverMapsRuntimeScriptSources} https://js.tosspayments.com https://t1.kakaocdn.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  `img-src 'self' data: blob: https://*.supabase.co https://*.pstatic.net https://*.kakaocdn.net${naverMapsRuntimeImageSources}${localSupabaseImages}`,
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://oapi.map.naver.com https://maps.apigw.ntruss.com https://*.naver.com https://*.tosspayments.com${localSupabaseConnections}${voiceConnections}`,
  "media-src 'self' blob:",
  "frame-src 'self' https://*.tosspayments.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self' https://*.tosspayments.com",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // Same-origin capability is not permission: the browser still asks after the user's microphone action.
  // Apply to the document entry too, because client-side route changes do not replace this policy.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  ...(isProduction ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000',
  }] : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || defaultDistDir,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
      ...(localSupabaseUrl ? [{
        protocol: 'http',
        hostname: localSupabaseUrl.hostname,
        port: localSupabaseUrl.port,
        pathname: '/storage/v1/object/sign/**',
      }] : []),
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
