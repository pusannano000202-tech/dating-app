import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
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
    const mapped = mapReviewError(error)
    return NextResponse.json({ error: mapped.code }, { status: mapped.status })
  }

  return NextResponse.json({ result: data })
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_my_reviews', { p_match_id: params.id })

  if (error) {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
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

function mapReviewError(error: { code?: string; message?: string }) {
  const message = error.message ?? ''

  if (error.code === '23505') return { code: 'review_already_exists', status: 409 }
  if (message.includes('match_not_found')) return { code: 'match_not_found', status: 404 }
  if (message.includes('not_match_participant')) return { code: 'not_match_participant', status: 403 }
  if (message.includes('match_not_completed')) return { code: 'match_not_completed', status: 409 }
  if (message.includes('comment_too_long')) return { code: 'comment_too_long', status: 400 }
  if (message.includes('invalid_overall_score')) return { code: 'invalid_overall_score', status: 400 }
  if (message.includes('invalid_reported_issue')) return { code: 'invalid_reported_issue', status: 400 }

  return { code: 'submit_failed', status: 500 }
}
