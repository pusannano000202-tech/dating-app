import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type SubscriptionBody = {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readBody(request)
  if (!isValidSubscription(body)) {
    return NextResponse.json({ error: 'invalid_push_subscription' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('upsert_my_campus_seven_push_subscription', {
    p_endpoint: body.endpoint,
    p_p256dh: body.keys.p256dh,
    p_auth_secret: body.keys.auth,
    p_user_agent: request.headers.get('user-agent'),
  })
  if (error) return pushRpcError(error.message)

  return NextResponse.json({ subscriptionId: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readBody(request)
  if (!body || typeof body.endpoint !== 'string' || !body.endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'invalid_push_subscription' }, { status: 400 })
  }

  const { error } = await supabase.rpc('delete_my_campus_seven_push_subscription', {
    p_endpoint: body.endpoint,
  })
  if (error) return pushRpcError(error.message)

  return NextResponse.json({ removed: true })
}

async function readBody(request: NextRequest): Promise<SubscriptionBody | null> {
  try {
    return await request.json() as SubscriptionBody
  } catch {
    return null
  }
}

function isValidSubscription(body: SubscriptionBody | null): body is {
  endpoint: string
  keys: { p256dh: string; auth: string }
} {
  return Boolean(
    body
    && typeof body.endpoint === 'string'
    && body.endpoint.startsWith('https://')
    && body.endpoint.length <= 2048
    && typeof body.keys?.p256dh === 'string'
    && body.keys.p256dh.length >= 32
    && typeof body.keys?.auth === 'string'
    && body.keys.auth.length >= 16,
  )
}

function pushRpcError(message = '') {
  if (message.includes('notifications_disabled')) {
    return NextResponse.json({ error: 'notifications_disabled' }, { status: 503 })
  }
  if (message.includes('active_enrollment_required')) {
    return NextResponse.json({ error: 'active_enrollment_required' }, { status: 403 })
  }
  if (message.includes('subscription_owned_by_another_user')) {
    return NextResponse.json({ error: 'subscription_conflict' }, { status: 409 })
  }
  return NextResponse.json({ error: 'push_subscription_failed' }, { status: 400 })
}
