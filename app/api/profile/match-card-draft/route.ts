import { NextRequest, NextResponse } from 'next/server'
import {
  QUANTUM_PRECARD_MAX_SUBMISSION_LENGTH,
  countCompletedQuantumPrecardSections,
  createQuantumPrecardDraftFromSubmissionText,
  validateQuantumPrecardDraft,
} from '@/lib/matching/quantum-precard'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const MINIMUM_CONTENT_LENGTH = 10

type PreMatchCardDraftRow = {
  user_id: string
  content_text: string
  completed_items: number
  submitted_at: string
  updated_at: string
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabase
    .rpc('get_my_pre_match_card_draft')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'draft_lookup_failed' }, { status: 500 })
  }

  return NextResponse.json({ draft: (data as PreMatchCardDraftRow | null) ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await readJson(req)
  const contentText = typeof body.content_text === 'string' ? body.content_text.trim() : ''
  if (contentText.length < MINIMUM_CONTENT_LENGTH || contentText.length > QUANTUM_PRECARD_MAX_SUBMISSION_LENGTH) {
    return NextResponse.json({ error: 'invalid_card_content' }, { status: 400 })
  }

  const draft = createQuantumPrecardDraftFromSubmissionText(contentText)
  const validation = validateQuantumPrecardDraft(draft)
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })
  const completedItems = countCompletedQuantumPrecardSections(draft)

  const { data, error } = await supabase
    .rpc('save_my_pre_match_card_draft', {
      p_content_text: contentText,
      p_completed_items: completedItems,
    })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'draft_save_failed' }, { status: 500 })
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
