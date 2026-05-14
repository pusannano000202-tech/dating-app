import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'

function LandingPage() {
  return (
    <main className="flex flex-col items-center min-h-screen px-5 pt-14 pb-10 overflow-hidden">

      {/* 배경 glow orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[500px] h-[500px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[400px] h-[400px] rounded-full bg-fuchsia-600/20 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm flex flex-col items-center">

        {/* 배지 */}
        <div className="glass rounded-full px-4 py-1.5 text-xs font-semibold text-violet-300 mb-8 tracking-wide">
          🎓 부산대에서 시작하는 그룹미팅
        </div>

        {/* 헤드라인 */}
        <h1 className="text-5xl font-black text-center leading-[1.1] mb-4 tracking-tight">
          지금,<br />
          <span className="gradient-brand-text">과팅하자</span>
        </h1>
        <p className="text-center text-gray-400 text-base leading-relaxed mb-10">
          친구들이랑 팀 짜고 보증금 걸면<br />
          <span className="text-white font-medium">시간·장소까지 자동으로</span> 잡아줘
        </p>

        {/* 미니 카드 프리뷰 */}
        <div className="w-full mb-10 relative h-36">
          {/* 뒤 카드 */}
          <div className="glass absolute left-0 right-8 top-3 bottom-0 rounded-3xl" />
          {/* 앞 카드 */}
          <div className="glass-strong absolute left-4 right-0 top-0 bottom-3 rounded-3xl p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center text-2xl flex-shrink-0">
              🎯
            </div>
            <div>
              <p className="text-sm font-bold mb-0.5">매칭 확정!</p>
              <p className="text-xs text-gray-400">금요일 저녁 7시</p>
              <p className="text-xs text-gray-400">서면 카페거리</p>
            </div>
            <div className="ml-auto">
              <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-sm">✓</div>
            </div>
          </div>
        </div>

        {/* 차별점 */}
        <div className="w-full flex flex-col gap-2.5 mb-10">
          {[
            { icon: '🙈', title: '프로필 비공개', desc: '만날 때까지 상대 사진 안 보여요' },
            { icon: '⚡', title: '자동 확정', desc: '채팅 없이 시간·장소 바로 확정' },
            { icon: '💰', title: '보증금으로 노쇼 방지', desc: '출석하면 환불, 노쇼는 상대방에게 보상' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
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
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-lg text-center block shadow-lg shadow-violet-900/40"
        >
          무료로 시작하기
        </Link>
        <p className="mt-3 text-xs text-gray-600">휴대폰 번호로 10초 가입</p>

      </div>
    </main>
  )
}

export default async function Home() {
  const isConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')

  if (!isConfigured) return <LandingPage />

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
      is_profile_complete,
      appearance_type,
      gender,
      big5_openness,
      available_timeslots,
      preference_weights
    `)
    .eq('user_id', user.id)
    .single()

  if (profile?.is_profile_complete) {
    redirect('/group/create')
  }

  // 첫 번째 미완성 단계로 이동
  if (!profile?.appearance_type) redirect('/profile/worldcup')
  if (!profile?.gender) redirect('/profile/basic')

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
