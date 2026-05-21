import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  extractSelfAppearanceScore,
  normalizeProfileAppearanceScore,
  resolveSelfAppearanceScore,
} from '@/lib/profile/appearance-score'

// Server-only env var (no NEXT_PUBLIC_ prefix) — AI server stays hidden from browser
const AI_SERVER_URL = process.env.AI_SERVER_URL ?? 'http://localhost:8001'

interface ScorePersistenceMetadata {
  self_appearance_score_persisted: boolean
  self_appearance_score?: number
  self_appearance_score_auto?: number
  self_appearance_score_source?: string
  self_appearance_score_persist_error?: string
}

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
    const data: unknown = await res.json()

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }

    if (isRecord(data) && data.status === 'error') {
      return NextResponse.json(
        withScorePersistenceMetadata(data, {
          self_appearance_score_persisted: false,
          self_appearance_score_persist_error: 'ai_score_failed',
        }),
        { status: res.status }
      )
    }

    const responseScore = extractSelfAppearanceScore(data)

    const { data: profile, error: readError } = await supabase
      .from('profiles')
      .select('self_appearance_score,self_appearance_score_override,appearance_score_normalized')
      .eq('user_id', user.id)
      .maybeSingle()

    if (readError) {
      return NextResponse.json(
        withScorePersistenceMetadata(data, {
          self_appearance_score_persisted: false,
          self_appearance_score_auto: responseScore ?? undefined,
          self_appearance_score_persist_error: 'profile_read_failed',
        }),
        { status: res.status }
      )
    }

    if (!profile) {
      return NextResponse.json(
        withScorePersistenceMetadata(data, {
          self_appearance_score_persisted: false,
          self_appearance_score_auto: responseScore ?? undefined,
          self_appearance_score_persist_error: 'profile_not_found',
        }),
        { status: res.status }
      )
    }

    const autoScore =
      responseScore ?? normalizeProfileAppearanceScore(profile.appearance_score_normalized)

    if (autoScore === null) {
      return NextResponse.json(
        withScorePersistenceMetadata(data, {
          self_appearance_score_persisted: false,
          self_appearance_score_persist_error: 'score_not_found',
        }),
        { status: res.status }
      )
    }

    const resolved = resolveSelfAppearanceScore({
      auto: autoScore,
      override: profile.self_appearance_score_override,
      legacy: profile.self_appearance_score,
    })

    if (!resolved) {
      return NextResponse.json(
        withScorePersistenceMetadata(data, {
          self_appearance_score_persisted: false,
          self_appearance_score_auto: autoScore,
          self_appearance_score_persist_error: 'score_resolve_failed',
        }),
        { status: res.status }
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        self_appearance_score_auto: autoScore,
        self_appearance_score: resolved.score,
        self_appearance_score_source: resolved.source,
        self_appearance_score_updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    return NextResponse.json(
      withScorePersistenceMetadata(data, {
        self_appearance_score_persisted: !updateError,
        self_appearance_score: resolved.score,
        self_appearance_score_auto: autoScore,
        self_appearance_score_source: resolved.source,
        self_appearance_score_persist_error: updateError ? 'profile_update_failed' : undefined,
      }),
      { status: res.status }
    )
  } catch {
    // Keep the API response non-fatal; profile UI decides whether to block progression.
    return NextResponse.json({ status: 'error', message: 'AI server unavailable' }, { status: 200 })
  } finally {
    clearTimeout(timeout)
  }
}

function withScorePersistenceMetadata(
  payload: unknown,
  metadata: ScorePersistenceMetadata
): unknown {
  if (isRecord(payload)) {
    return {
      ...payload,
      ...metadata,
    }
  }

  return {
    data: payload,
    ...metadata,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
