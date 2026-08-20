import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  APPEARANCE_SCORE_TABLE,
  createAppearanceServiceClient,
  isOwnedAppearanceStoragePath,
} from '@/lib/profile/appearance-score-storage'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const service = createAppearanceServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'server_unavailable' }, { status: 503 })
  }

  const { data: photos, error: photoError } = await service
    .from('photos')
    .select('storage_path')
    .eq('user_id', user.id)
    .order('sort_order')
    .limit(3)

  if (photoError) {
    return NextResponse.json({ error: 'photo_read_failed' }, { status: 503 })
  }
  if (!photos?.length || photos.some((photo) => !isOwnedAppearanceStoragePath(photo.storage_path, user.id))) {
    return NextResponse.json({ error: 'photo_required' }, { status: 409 })
  }

  const { error: invalidateError } = await service
    .from(APPEARANCE_SCORE_TABLE)
    .upsert({
      user_id: user.id,
      photo_revision: randomUUID(),
      analyzed_photo_revision: null,
      status: 'stale',
      request_id: null,
      attempt_count: 0,
      score_raw: null,
      score_normalized: null,
      confidence_0_1: null,
      appearance_type: null,
      provider: null,
      model_version: null,
      prompt_version: null,
      anchor_version: null,
      error_code: null,
      analyzed_at: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (invalidateError) {
    return NextResponse.json({ error: 'score_invalidation_failed' }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
