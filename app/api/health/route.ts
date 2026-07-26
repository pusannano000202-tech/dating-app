import { NextResponse } from 'next/server'
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from '@/lib/utils'

export async function GET() {
  const supabaseOk = await checkSupabase()
  return NextResponse.json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
    supabase: supabaseOk,
  })
}

async function checkSupabase(): Promise<boolean | null> {
  if (!isSupabaseConfigured()) return null
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const url = `${getSupabaseUrl()}/auth/v1/health`
    const controller = new AbortController()
    timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      headers: { apikey: getSupabasePublicKey() },
      signal: controller.signal,
    })

    if (!res.ok) {
      console.error('[health] Supabase health check failed', {
        status: res.status,
      })
    }

    return res.ok
  } catch (error) {
    console.error('[health] Supabase health check failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown failure',
    })
    return false
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
