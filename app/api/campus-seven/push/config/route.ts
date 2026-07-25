import { NextResponse } from 'next/server'
import {
  getCampusSevenWebPushConfig,
  isCampusSevenWebPushReady,
} from '@/lib/campus-seven/web-push'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = getCampusSevenWebPushConfig()
  if (!isCampusSevenWebPushReady(config)) {
    return NextResponse.json({ enabled: false, reason: 'not_configured' })
  }

  const { data: ready, error } = await supabase.rpc('get_my_campus_seven_push_readiness')
  if (error) {
    return NextResponse.json({ enabled: false, reason: 'program_setup_required' }, { status: 503 })
  }
  if (ready !== true) {
    return NextResponse.json({ enabled: false, reason: 'not_available' })
  }

  return NextResponse.json({ enabled: true, publicKey: config.publicKey })
}
