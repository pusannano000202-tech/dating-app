import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-only env var (no NEXT_PUBLIC_ prefix) — AI server stays hidden from browser
const AI_SERVER_URL = process.env.AI_SERVER_URL ?? 'http://localhost:8001'

export async function POST(req: NextRequest) {
  // Verify the caller is authenticated
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { photo_urls: string[] }
  if (!Array.isArray(body.photo_urls) || body.photo_urls.length === 0) {
    return NextResponse.json({ error: 'photo_urls required' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${AI_SERVER_URL}/api/score-photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, photo_urls: body.photo_urls }),
      signal: controller.signal,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    // Fire-and-forget semantics: never fail the client flow
    return NextResponse.json({ status: 'error', message: 'AI server unavailable' }, { status: 200 })
  } finally {
    clearTimeout(timeout)
  }
}
