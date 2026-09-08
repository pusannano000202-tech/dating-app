import { NextRequest, NextResponse } from 'next/server'

import { requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { isAllowedTonightPushEndpoint, TONIGHT_PUSH_CONSENT_VERSION } from '@/lib/notifications/tonight-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

type SubscriptionBody = {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
  consentVersion?: unknown
}

export async function POST(request: NextRequest) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user', 'partner'] })
    const body = await readBody(request)
    if (!isValidSubscription(body)) {
      return NextResponse.json({ error: 'invalid_push_subscription' }, { status: 400 })
    }
    if (!isAllowedTonightPushEndpoint(body.endpoint)) {
      return NextResponse.json({ error: 'unsupported_push_service' }, { status: 400 })
    }
    if (body.consentVersion !== TONIGHT_PUSH_CONSENT_VERSION) {
      return NextResponse.json({ error: 'explicit_tonight_consent_required' }, { status: 400 })
    }

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('upsert_my_tonight_push_subscription', {
      p_endpoint: body.endpoint,
      p_p256dh: body.keys.p256dh,
      p_auth_secret: body.keys.auth,
      p_user_agent: request.headers.get('user-agent'),
      p_consent_version: body.consentVersion,
    })
    if (error) return pushRpcError(error.message)

    return NextResponse.json({ subscriptionId: data }, { status: 201 })
  } catch (error) {
    return requestGuardErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user', 'partner'] })
    const body = await readBody(request)
    if (!body || typeof body.endpoint !== 'string' || !body.endpoint.startsWith('https://')) {
      return NextResponse.json({ error: 'invalid_push_subscription' }, { status: 400 })
    }

    const supabase = createSupabaseRequestClient(request)
    const { error } = await supabase.rpc('delete_my_tonight_push_subscription', {
      p_endpoint: body.endpoint,
    })
    if (error) return pushRpcError(error.message)

    return NextResponse.json({ removed: true })
  } catch (error) {
    return requestGuardErrorResponse(error)
  }
}

async function readBody(request: NextRequest): Promise<SubscriptionBody | null> {
  const contentType = request.headers.get('content-type')?.trim()
  if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) return null
  try {
    return await request.json() as SubscriptionBody
  } catch {
    return null
  }
}

function isValidSubscription(body: SubscriptionBody | null): body is {
  endpoint: string
  keys: { p256dh: string; auth: string }
  consentVersion: string
} {
  return Boolean(
    body
    && typeof body.endpoint === 'string'
    && body.endpoint.startsWith('https://')
    && body.endpoint.length <= 2048
    && typeof body.keys?.p256dh === 'string'
    && body.keys.p256dh.length >= 32
    && typeof body.keys?.auth === 'string'
    && body.keys.auth.length >= 16
    && typeof body.consentVersion === 'string',
  )
}

function pushRpcError(message = '') {
  if (message.includes('explicit_tonight_consent_required')) {
    return NextResponse.json({ error: 'explicit_tonight_consent_required' }, { status: 400 })
  }
  if (message.includes('tonight_access_required')) {
    return NextResponse.json({ error: 'tonight_access_required' }, { status: 403 })
  }
  if (message.includes('subscription_owned_by_another_user')) {
    return NextResponse.json({ error: 'subscription_conflict' }, { status: 409 })
  }
  if (message.includes('tonight_push_subscription_limit_reached')) {
    return NextResponse.json({ error: 'push_subscription_limit_reached' }, { status: 409 })
  }
  return NextResponse.json({ error: 'push_subscription_failed' }, { status: 400 })
}
