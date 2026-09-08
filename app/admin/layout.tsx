import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { RequestGuardError, requireServerAccess, type AccessGuardClient } from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseConfigIssue } from '@/lib/utils'
import BootingLogo from '@/components/BootingLogo'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (getSupabaseConfigIssue()) redirect('/auth/unavailable')

  let accessRole = 'admin'
  try {
    const supabase = await createSupabaseServerClient()
    const guarded = await requireServerAccess(supabase as unknown as AccessGuardClient, {
      allowedRoles: ['admin', 'super_admin'],
    })
    accessRole = guarded.access.accessRole
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      redirect('/login?redirect=%2Fadmin')
    }
    if (error instanceof RequestGuardError && error.code === 'mfa_required') {
      redirect('/auth/mfa?returnTo=%2Fadmin%2Ftonight')
    }
    if (error instanceof RequestGuardError && error.status === 403) notFound()
    redirect('/auth/unavailable')
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
          <Link href="/admin/voice" className="inline-flex min-h-11 items-center text-xs font-bold text-boot-primary">보이스 모집</Link>
          {accessRole === 'super_admin' && (
            <Link href="/admin/matches/review" className="inline-flex items-center gap-1.5 rounded-full bg-boot-soft px-3 py-1.5 text-xs font-black text-boot-primary">
              <ShieldCheck size={13} />
              민감 매칭 리뷰
            </Link>
          )}
          <Link href="/" className="text-xs font-bold text-boot-muted hover:text-boot-ink">
            앱으로
          </Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
