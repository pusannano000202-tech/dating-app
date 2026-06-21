// 결제 라우트 인증 헬퍼.
// - getSessionUser: 쿠키 세션에서 로그인 사용자를 읽는다(없으면 null). prepare/confirm 보호용.
// - isInternalCaller: 서버-내부 호출(환불 트리거 등)을 내부 시크릿으로 검증. cancel 보호용.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'crypto'

export async function getSessionUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const cookieStore = cookies()
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      // 라우트 핸들러에서는 쿠키를 쓰지 않는다(읽기 전용 검증).
      setAll() {},
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * 서버-내부 전용 호출 검증. cancel(환불)은 사용자가 직접 부르면 안 되고
 * (선환불 후 노쇼 악용), 만남 인증 성공 같은 서버 로직에서만 트리거돼야 한다.
 * 호출 측은 `Authorization: Bearer <PAYMENT_INTERNAL_SECRET>` 를 보낸다.
 */
export function isInternalCaller(req: Request): boolean {
  const secret = process.env.PAYMENT_INTERNAL_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token.length !== secret.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  } catch {
    return false
  }
}
