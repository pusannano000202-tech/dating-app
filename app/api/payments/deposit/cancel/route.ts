import { NextRequest, NextResponse } from 'next/server'
import {
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'

export async function GET(req: NextRequest) {
  const result = readCancelResult(req)
  const target = new URL('/match/start', req.nextUrl.origin)
  target.searchParams.set('payment', 'cancelled')
  target.searchParams.set('provider', result.provider)
  if (result.groupId) {
    target.searchParams.set('group_id', result.groupId)
  }
  if (result.reason) {
    target.searchParams.set('reason', result.reason)
  }

  return NextResponse.redirect(target)
}

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const result = readCancelResult(req, body)

  return NextResponse.json({
    provider: result.provider,
    status: 'payment_cancelled',
    group_id: result.groupId,
    reason: result.reason,
    provider_ready: result.providerReady,
  })
}

function readCancelResult(req: NextRequest, body: Record<string, unknown> = {}) {
  const provider = resolveDepositPaymentProvider(
    readString(body.provider) ?? req.nextUrl.searchParams.get('provider'),
  )
  const readiness = getDepositPaymentReadiness(provider)

  return {
    provider,
    groupId: readString(body.group_id) ?? req.nextUrl.searchParams.get('group_id') ?? '',
    reason: readString(body.reason) ?? req.nextUrl.searchParams.get('reason') ?? 'checkout_cancelled',
    providerReady: readiness.ok,
  }
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}
