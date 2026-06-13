import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSupabaseConfigured } from '@/lib/utils'
import BootingLogo from '@/components/BootingLogo'

// 운영자 콘솔 가드. is_admin() 아니면 차단.
// 로컬(placeholder Supabase)에서는 UI 확인을 위해 가드를 건너뛴다 (middleware 와 동일 규칙).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const devBypass =
    !isSupabaseConfigured()

  if (!devBypass) {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin')
    const { data: isAdmin, error } = await supabase.rpc('is_admin')
    if (error || !isAdmin) redirect('/')
  }

  return (
    <div className="min-h-screen booting-band">
      <nav className="sticky top-0 z-10 glass-strong border-b border-boot-hairline">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2 font-black">
            <BootingLogo size="sm" showSubtitle={false} />
            <span className="hidden text-sm text-boot-muted sm:inline">운영자 콘솔</span>
          </Link>
          <div className="flex-1" />
          <Link href="/admin/matches/review" className="inline-flex items-center gap-1.5 rounded-full bg-boot-soft px-3 py-1.5 text-xs font-black text-boot-primary">
            <ShieldCheck size={13} />
            매칭 리뷰
          </Link>
          <Link href="/" className="text-xs font-bold text-boot-muted hover:text-boot-ink">
            앱으로
          </Link>
        </div>
      </nav>
      {devBypass && (
        <div className="max-w-3xl mx-auto px-5 pt-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
            로컬 개발 모드 — 운영자 권한 검사를 건너뛰는 중입니다. 프로덕션에서는 is_admin() 가드가 적용됩니다.
          </p>
        </div>
      )}
      {children}
    </div>
  )
}
