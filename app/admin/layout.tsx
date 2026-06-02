import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// 운영자 콘솔 가드. is_admin() 아니면 차단.
// 로컬(placeholder Supabase)에서는 UI 확인을 위해 가드를 건너뛴다 (middleware 와 동일 규칙).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const devBypass =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')

  if (!devBypass) {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin')
    const { data: isAdmin, error } = await supabase.rpc('is_admin')
    if (error || !isAdmin) redirect('/')
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-10 glass-strong border-b border-white/10">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2 font-black">
            <ShieldCheck size={18} className="text-violet-300" />
            운영자 콘솔
          </Link>
          <div className="flex-1" />
          <Link href="/admin/matches/review" className="text-xs text-gray-300 hover:text-white">
            매칭 리뷰
          </Link>
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-300">
            앱으로
          </Link>
        </div>
      </nav>
      {devBypass && (
        <div className="max-w-3xl mx-auto px-5 pt-3">
          <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            ⚠️ 로컬 개발 모드 — 운영자 권한 검사를 건너뛰는 중입니다. 프로덕션에서는 is_admin() 가드가 적용됩니다.
          </p>
        </div>
      )}
      {children}
    </div>
  )
}
