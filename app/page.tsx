import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'

export default async function Home() {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 로그인된 경우 프로필 완성 여부 확인
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_profile_complete')
      .eq('user_id', user.id)
      .single()

    if (profile?.is_profile_complete) {
      redirect('/group/create') // 성준 영역 — 프로필 완성 유저는 바로 그룹으로
    } else {
      redirect('/profile/worldcup') // 프로필 미완성 → 이어서 작성
    }
  }

  // 비로그인 랜딩 페이지
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white px-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* 로고 */}
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">🎯</div>
          <h1 className="text-3xl font-black mb-2">부산대 과팅</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            친구들과 팀을 짜고 보증금을 걸면
            <br />
            시간·장소까지 자동으로 잡아드려요
          </p>
        </div>

        {/* 차별점 3가지 */}
        <div className="w-full flex flex-col gap-3 mb-10">
          {[
            { icon: '🙈', title: '프로필 비공개', desc: '만나기 전까지 상대 사진 안 보여요' },
            { icon: '⚡', title: '자동 확정', desc: '채팅 없이 시간·장소 바로 잡아드려요' },
            { icon: '💰', title: '보증금으로 노쇼 방지', desc: '나타나면 환불, 노쇼는 출석자에게 보상' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 bg-white/5 rounded-2xl px-4 py-3">
              <span className="text-xl mt-0.5">{icon}</span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/login"
          className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 font-bold text-lg text-center transition-colors"
        >
          시작하기
        </Link>
        <p className="mt-3 text-xs text-gray-600">휴대폰 번호로 가입해요</p>
      </div>
    </main>
  )
}
