'use client'

import Link from 'next/link'

const STEPS = [
  { icon: '👤', label: '그룹 멤버 초대', desc: '친구 2~3명에게 초대 링크 전송' },
  { icon: '💰', label: '보증금 결제', desc: '토스페이먼츠로 1인 2만원' },
  { icon: '🎯', label: '자동 매칭 대기', desc: '시스템이 상대 그룹 찾아줘' },
  { icon: '📍', label: '장소·시간 확정', desc: '부산대 근처 카페로 자동 확정' },
]

// TODO: 성준 담당 — 실제 그룹 생성/초대 UI 구현
// 현재는 플로우 안내 플레이스홀더
export default function GroupCreatePage() {
  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      {/* 배경 glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full bg-fuchsia-600/15 blur-[80px]" />
      </div>

      <div className="relative pt-8">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl gradient-brand mb-4 shadow-2xl shadow-violet-900/50">
            <span className="text-4xl">👥</span>
          </div>
          <h1 className="text-2xl font-black">그룹 과팅 신청</h1>
          <p className="text-sm text-gray-500 mt-1">
            친구들과 팀 만들고 자동으로 매칭받아봐
          </p>
        </div>

        {/* 진행 상황 배지 */}
        <div className="glass rounded-2xl px-4 py-3 mb-6 flex items-center gap-3 border border-amber-500/30">
          <span className="text-2xl">🚧</span>
          <div>
            <p className="text-sm font-bold text-amber-400">개발 중이야!</p>
            <p className="text-xs text-gray-500">성준이가 열심히 만들고 있어. 조금만 기다려줘</p>
          </div>
        </div>

        {/* 플로우 미리보기 */}
        <div className="space-y-3 mb-8">
          <p className="text-xs text-gray-600 font-medium uppercase tracking-wider px-1">이렇게 진행될 거야</p>
          {STEPS.map(({ icon, label, desc }, i) => (
            <div key={label} className="glass rounded-2xl px-4 py-4 flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <span className="text-xl">{icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <span className="text-xs text-gray-700 font-bold">{i + 1}</span>
            </div>
          ))}
        </div>

        {/* 프로필 수정 링크 */}
        <Link
          href="/profile/edit"
          className="glass w-full py-3 rounded-2xl text-sm text-gray-400 text-center block hover:text-gray-200 transition-colors border border-white/5"
        >
          프로필 수정하기 →
        </Link>
      </div>
    </div>
  )
}
