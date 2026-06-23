import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null
  if (!decision) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 })

  const { data, error } = await supabase
    .rpc('admin_review_match', {
      p_match_id: params.id,
      p_decision: decision,
      p_reason: typeof body.reason === 'string' ? body.reason : null,
      p_add_excluded: body.add_excluded === true,
    })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'review_failed' }, { status: 400 })
  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}
