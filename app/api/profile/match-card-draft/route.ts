import { NextRequest, NextResponse } from 'next/server'
import {
  countCompletedDailyCardItems,
  createDailyCardDraftFromSubmissionText,
} from '@/lib/matching/daily-card-authoring'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const MINIMUM_COMPLETED_ITEMS = 4
const MINIMUM_CONTENT_LENGTH = 10
const MAXIMUM_CONTENT_LENGTH = 500

type PreMatchCardDraftRow = {
  user_id: string
  content_text: string
  completed_items: number
  submitted_at: string
  updated_at: string
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('pre_match_card_drafts')
    .select('user_id,content_text,completed_items,submitted_at,updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'draft_lookup_failed' }, { status: 400 })
  }

  return NextResponse.json({ draft: (data as PreMatchCardDraftRow | null) ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const contentText = typeof body.content_text === 'string' ? body.content_text.trim() : ''
  if (contentText.length < MINIMUM_CONTENT_LENGTH || contentText.length > MAXIMUM_CONTENT_LENGTH) {
    return NextResponse.json({ error: 'invalid_card_content' }, { status: 400 })
  }

  const completedItems = countCompletedDailyCardItems(
    createDailyCardDraftFromSubmissionText(contentText),
  )
  if (completedItems < MINIMUM_COMPLETED_ITEMS) {
    return NextResponse.json({ error: 'card_incomplete' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pre_match_card_drafts')
    .upsert({
      user_id: user.id,
      content_text: contentText,
      completed_items: completedItems,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('user_id,content_text,completed_items,submitted_at,updated_at')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'draft_save_failed' }, { status: 400 })
  }

  return NextResponse.json({ draft: data as PreMatchCardDraftRow }, { status: 201 })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
