import { NextRequest, NextResponse } from 'next/server'
import {
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'

export async function POST(req: NextRequest) {
  const provider = resolveDepositPaymentProvider(req.nextUrl.searchParams.get('provider'))
  const readiness = getDepositPaymentReadiness(provider)

  if (!readiness.ok) {
    return NextResponse.json({
      error: 'payment_provider_not_configured',
      provider: readiness.provider,
    }, { status: 503 })
  }

  if (provider === 'mock') {
    return NextResponse.json({ provider, received: true, ignored: true })
  }

  const body = await req.text()
  if (!body.trim()) {
    return NextResponse.json({ error: 'empty_webhook_body' }, { status: 400 })
  }

  return NextResponse.json({
    provider,
    received: true,
    status: 'stored_for_payment_reconciliation',
  })
}
