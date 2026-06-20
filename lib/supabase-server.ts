// 서버 전용 Supabase 클라이언트 (service_role). API 라우트에서만 import.
// service_role 키는 절대 클라이언트 번들에 노출 금지 — NEXT_PUBLIC_ 접두사 사용 안 함.
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
