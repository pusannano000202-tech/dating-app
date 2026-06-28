import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const overallScore = typeof body.overall_score === 'number' ? body.overall_score : 0
  const reportedIssues = Array.isArray(body.reported_issues)
    ? (body.reported_issues as unknown[]).filter((v): v is string => typeof v === 'string')
    : []
  const comment = typeof body.comment === 'string' ? body.comment : null

  if (!Number.isInteger(overallScore) || overallScore < 1 || overallScore > 5) {
    return NextResponse.json({ error: 'invalid_overall_score' }, { status: 400 })
  }

  const { data, error } = await supabase
    .rpc('submit_review', {
      p_match_id: params.id,
      p_overall_score: overallScore,
      p_reported_issues: reportedIssues,
      p_comment: comment,
    })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'submit_failed' }, { status: 400 })
  }

  return NextResponse.json({ result: data })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_my_reviews', { p_match_id: params.id })

  if (error) {
    return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  }

  return NextResponse.json({ reviews: data ?? [] })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
