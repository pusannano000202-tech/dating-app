import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'missing_key' }, { status: 400 })

  const { data, error } = await supabase.rpc('get_app_config', { p_key: key })
  if (error) return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  return NextResponse.json({ key, value: data })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const key = typeof body.key === 'string' ? body.key : null
  if (!key || !('value' in body)) return NextResponse.json({ error: 'missing_key_or_value' }, { status: 400 })

  const { data, error } = await supabase.rpc('set_app_config', { p_key: key, p_value: body.value })
  if (error) return NextResponse.json({ error: error.message || 'update_failed' }, { status: 400 })
  return NextResponse.json({ key, value: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}
