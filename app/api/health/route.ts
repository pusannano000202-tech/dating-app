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
  try {
    const url = `${getSupabaseUrl()}/auth/v1/health`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      headers: { apikey: getSupabasePublicKey() },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok || res.status === 200
  } catch {
    return false
  }
}
