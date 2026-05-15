import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/utils'

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
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok || res.status === 200
  } catch {
    return false
  }
}
