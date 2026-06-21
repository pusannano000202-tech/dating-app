import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  isDepositPaymentAmountValid,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  return confirmDeposit(req)
}

export async function GET(req: NextRequest) {
  return confirmDeposit(req)
}

async function confirmDeposit(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = req.method === 'POST' ? await readJson(req) : {}
  const groupId = readString(body.group_id) ?? req.nextUrl.searchParams.get('group_id') ?? ''
  const provider = resolveDepositPaymentProvider(readString(body.provider) ?? req.nextUrl.searchParams.get('provider'))
  const amount = readNumber(body.amount) ?? Number(req.nextUrl.searchParams.get('amount') ?? DEPOSIT_AMOUNT)

  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }
  if (!isDepositPaymentAmountValid(amount)) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }

  const readiness = getDepositPaymentReadiness(provider)
  if (!readiness.ok) {
    return NextResponse.json({
      error: readiness.error,
      provider: readiness.provider,
    }, { status: 503 })
  }

  if (provider !== 'mock') {
    return NextResponse.json({
      provider,
      status: 'awaiting_provider_webhook',
      message: '결제사 승인 값 확인 자리는 준비됐고, 실제 승인 호출은 결제사 키 연결 후 활성화합니다.',
    }, { status: 202 })
  }

  const { data, error } = await supabase
    .rpc('mock_pay_deposit', { p_group_id: groupId, p_amount: DEPOSIT_AMOUNT })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'pay_failed' }, { status: 400 })
  }

  return NextResponse.json({ provider, status: 'paid', deposit: data }, { status: 201 })
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

function readNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return null
}
