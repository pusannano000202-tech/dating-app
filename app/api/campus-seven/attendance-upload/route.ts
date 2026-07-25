import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCampusSevenFeatureState } from '@/lib/campus-seven/program'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

export async function POST(req: NextRequest) {
  const feature = getCampusSevenFeatureState()
  if (!feature.visible) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const scheduleId = typeof body.scheduleId === 'string' && UUID_PATTERN.test(body.scheduleId)
    ? body.scheduleId
    : null
  const contentType = typeof body.contentType === 'string' ? body.contentType : ''
  const extension = ALLOWED_TYPES.get(contentType)
  if (!scheduleId || !extension) {
    return NextResponse.json({ error: 'invalid_upload_request' }, { status: 400 })
  }

  const { data: dashboardData, error: dashboardError } = await supabase
    .rpc('get_my_campus_seven_dashboard')
  const dashboard = dashboardData as null | {
    enrollment?: { status?: string }
    schedule?: { id?: string }
  }
  if (dashboardError || !dashboard?.enrollment || !dashboard.schedule || dashboard.schedule.id !== scheduleId) {
    return NextResponse.json({ error: 'attendance_schedule_not_allowed' }, { status: 403 })
  }

  const objectPath = `${user.id}/${scheduleId}/${Date.now()}-${randomUUID()}.${extension}`
  const { data, error } = await supabase.storage
    .from('campus-seven-attendance')
    .createSignedUploadUrl(objectPath, { upsert: false })

  if (error || !data?.token) {
    return NextResponse.json({ error: 'upload_ticket_failed' }, { status: 400 })
  }

  return NextResponse.json({ path: objectPath, token: data.token })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
