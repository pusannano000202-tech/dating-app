import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface MatchDetailForCard {
  match_id: string
  my_group_id: string
  my_card_submitted_at: string | null
  my_card_content_text: string | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .rpc('get_match_detail', { p_match_id: params.id })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'card_lookup_failed' }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  }

  const detail = data as MatchDetailForCard
  return NextResponse.json({
    card: {
      match_id: detail.match_id,
      submitted_at: detail.my_card_submitted_at,
      content_text: detail.my_card_content_text ?? '',
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const contentText = typeof body.content_text === 'string' ? body.content_text.trim() : ''
  if (contentText.length < 10 || contentText.length > 500) {
    return NextResponse.json({ error: 'invalid_card_content' }, { status: 400 })
  }

  const { data: detailData, error: detailError } = await supabase
    .rpc('get_match_detail', { p_match_id: params.id })
    .maybeSingle()

  if (detailError) {
    return NextResponse.json({ error: detailError.message || 'match_lookup_failed' }, { status: 400 })
  }
  if (!detailData) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  }

  const detail = detailData as MatchDetailForCard
  const { data, error } = await supabase
    .from('match_card_submissions')
    .upsert({
      match_id: params.id,
      group_id: detail.my_group_id,
      user_id: user.id,
      content_text: contentText,
    }, { onConflict: 'match_id,user_id' })
    .select('match_id,group_id,user_id,content_text,updated_at')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'card_save_failed' }, { status: 400 })
  }

  return NextResponse.json({ card: data }, { status: 201 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
