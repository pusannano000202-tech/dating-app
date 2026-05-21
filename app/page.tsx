import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { isSupabaseConfigured } from '@/lib/utils'
import DestinyLogo from '@/components/DestinyLogo'
import MatchingPool from '@/components/MatchingPool'

function LandingPage() {
  return (
    <main className="flex flex-col items-center min-h-screen px-5 pt-12 pb-16 overflow-hidden">

      {/* 배경 강화 glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%]  w-[600px] h-[600px] rounded-full bg-violet-700/25  blur-[160px]" />
        <div className="absolute top-[-10%] right-[-20%] w-[450px] h-[450px] rounded-full bg-rose-700/20    blur-[130px]" />
        <div className="absolute bottom-[-15%] left-1/2  -translate-x-1/2 w-[500px] h-[400px] rounded-full bg-purple-800/18 blur-[140px]" />
        <div className="absolute top-[40%] right-[5%]   w-[180px] h-[180px] rounded-full bg-amber-600/6   blur-[70px]" />
      </div>

      <div className="relative w-full max-w-sm flex flex-col items-center">

        {/* 로고 */}
        <div className="flex flex-col items-center mb-8 animate-float">
          <DestinyLogo size={52} className="mb-3" />
          <h1 className="font-destiny text-3xl font-bold tracking-wider gradient-brand-text">
            Destiny
          </h1>
        </div>

        {/* 헤드라인 — Manus 카피 */}
        <h2 className="text-[28px] font-black text-center leading-[1.2] mb-3 tracking-tight">
          당신의 인연이<br />
          <span className="gradient-fate-text">여기서 시작됩니다</span>
        </h2>
        <p className="text-center text-gray-400 text-sm leading-relaxed mb-10">
          운명적인 만남을 기다리고 있어요<br />
          <span className="text-white/70 font-medium">시간·장소까지 자동으로</span> 잡아줘
        </p>

        {/* ── Soul Orbs 매칭 풀 시각화 ── */}
        <div className="glass-card rounded-3xl p-6 w-full mb-8 flex flex-col items-center">
          <MatchingPool />
        </div>

        {/* 차별점 3가지 */}
        <div className="w-full flex flex-col gap-2 mb-8">
          {[
            { color: '#a78bfa', title: '프로필 비공개', desc: '만날 때까지 상대 사진 안 보여요' },
            { color: '#f472b6', title: '자동 확정',     desc: '채팅 없이 시간·장소 바로 확정' },
            { color: '#fbbf24', title: '보증금 노쇼 방지', desc: '출석하면 환불, 노쇼는 상대방에게 보상' },
          ].map(({ color, title, desc }) => (
            <div key={title} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
              <div
                className="w-2 h-8 rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 10px ${color}` }}
              />
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/login"
          className="btn-gradient-animated w-full py-4 rounded-2xl font-bold text-lg text-center block"
        >
          인연 찾기
        </Link>
        <p className="mt-3 text-xs text-gray-600">휴대폰 번호로 10초 가입 · 무료</p>

      </div>
    </main>
  )
}

export default async function Home() {
  if (!isSupabaseConfigured()) return <LandingPage />

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <LandingPage />

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      is_profile_complete, appearance_type, gender,
      big5_openness, available_timeslots, preference_weights
    `)
    .eq('user_id', user.id)
    .single()

  if (profile?.is_profile_complete) redirect('/group/create')
  if (!profile?.gender)             redirect('/profile/basic')
  if (!profile?.appearance_type)    redirect('/profile/worldcup')

  const { count } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (!count || count === 0) redirect('/profile/photos')

  if (profile.big5_openness == null) redirect('/profile/survey')

  const timeslots = profile.available_timeslots as { slots?: unknown[] } | null
  if (!timeslots?.slots?.length) redirect('/profile/schedule')

  if (!profile.preference_weights) redirect('/profile/preferences')

  redirect('/profile/complete')
}
