// 공용 파일 — 수정 시 상대방(성준) 알림 필수
import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfigIssue } from './utils'

export function createClient() {
  const configIssue = getSupabaseConfigIssue()
  if (configIssue) {
    if (process.env.NODE_ENV !== 'production') {
      return createBrowserClient(
        'https://placeholder.supabase.co',
        'placeholder-anon-key'
      )
    }
    throw new Error(configIssue)
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
