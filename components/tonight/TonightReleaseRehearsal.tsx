'use client'

import { useState } from 'react'
import {
  Building2,
  Check,
  Clock3,
  RotateCcw,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'

import AdminTonightConsole from './AdminTonightConsole'
import PartnerTonightConsole from './PartnerTonightConsole'
import SuperAdminTonightConsole from './SuperAdminTonightConsole'
import UserTonightExperience from './UserTonightExperience'
import { createRehearsalAdapters } from './rehearsal-fixtures'
import {
  REHEARSAL_STAGES,
  getRehearsalBlockReason,
  isRehearsalStageReady,
  type RehearsalStageIndex,
} from './rehearsal-state'

type RehearsalRole = 'user' | 'partner' | 'admin' | 'superAdmin'

export default function TonightReleaseRehearsal() {
  const [role, setRole] = useState<RehearsalRole>('user')
  const [stage, setStage] = useState<RehearsalStageIndex>(0)
  const [readyThrough, setReadyThrough] = useState(0)
  const [adapters, setAdapters] = useState(() => createRehearsalAdapters(0))
  const ready = isRehearsalStageReady(stage, readyThrough)
  const blockReason = getRehearsalBlockReason(stage, readyThrough)

  const openStage = (nextStage: RehearsalStageIndex) => {
    setStage(nextStage)
    setAdapters(createRehearsalAdapters(nextStage))
  }

  const reset = () => {
    setRole('user')
    setStage(0)
    setReadyThrough(0)
    setAdapters(createRehearsalAdapters(0))
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#efe8e3] pb-10">
      <div className="sticky top-0 z-50 border-b border-[#dbc8bf] bg-white/95 px-3 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">LOCAL RELEASE REHEARSAL · 로컬 체험</p>
              <h1 className="mt-1 text-lg font-black">오늘밤 네 역할 전체 여정 검토</h1>
              <p className="mt-1 text-xs font-semibold text-[#8b7e78]">결제·저장·신고는 실제로 처리되지 않으며 production과 같은 컴포넌트를 사용합니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setReadyThrough(7)
                  setAdapters(createRehearsalAdapters(stage))
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white"
              >
                <Check className="h-4 w-4" aria-hidden />
                모든 시간 검증 열기
              </button>
              <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dbc8bf] bg-white px-3 text-xs font-black">
                <RotateCcw className="h-4 w-4" aria-hidden />
                처음부터 reset
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto pb-1" aria-label="검토할 역할">
            <div className="flex min-w-max gap-2">
              {([
                ['user', User, '사용자'],
                ['partner', Building2, '업장'],
                ['admin', Users, '운영자'],
                ['superAdmin', ShieldCheck, '최고관리자'],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  aria-pressed={role === value}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-black ${
                    role === value ? 'bg-[#292321] text-white' : 'border border-[#dbc8bf] bg-white text-[#665c58]'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 overflow-x-auto pb-1" aria-label="가상 운영 시간">
            <div className="flex min-w-max gap-2">
              {REHEARSAL_STAGES.map((item, index) => {
                const stageIndex = index as RehearsalStageIndex
                const stageReady = isRehearsalStageReady(stageIndex, readyThrough)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openStage(stageIndex)}
                    aria-pressed={stage === stageIndex}
                    className={`min-h-12 rounded-xl border px-3 text-left text-xs font-black transition ${
                      stage === stageIndex
                        ? 'border-[#b94b3f] bg-[#fff0eb] text-[#b94b3f] ring-2 ring-[#b94b3f]/10'
                        : stageReady
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-[#dbc8bf] bg-white text-[#8b7e78]'
                    }`}
                  >
                    <span className="block">{item.time}</span>
                    <span className="mt-0.5 block font-semibold">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {!ready ? (
        <main className="mx-auto max-w-2xl px-4 py-10">
          <section className="rounded-[28px] border border-amber-300 bg-amber-50 p-6 text-center shadow-[0_20px_60px_rgba(67,39,30,0.08)]" role="alert">
            <Clock3 className="mx-auto h-9 w-9 text-amber-700" aria-hidden />
            <p className="mt-4 text-xs font-black tracking-[0.12em] text-amber-800">선택한 가상 시간 · {REHEARSAL_STAGES[stage].time}</p>
            <h2 className="mt-2 text-2xl font-black">이 장면에 필요한 준비가 남았어요</h2>
            <p className="mt-3 font-semibold leading-6 text-amber-950">{blockReason}</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-amber-800">버튼이 고장 난 것이 아니에요. 아래 버튼으로 앞 단계 데이터를 채운 뒤 같은 시각의 화면을 바로 확인할 수 있습니다.</p>
            <button
              type="button"
              onClick={() => {
                setReadyThrough(stage)
                setAdapters(createRehearsalAdapters(stage))
              }}
              className="mt-6 min-h-12 w-full rounded-2xl bg-amber-800 px-5 text-sm font-black text-white sm:w-auto"
            >
              {REHEARSAL_STAGES[stage].time} 정상 상태 준비하고 열기
            </button>
          </section>
        </main>
      ) : (
        <div key={`${role}-${stage}`}>
          {role === 'user' && <UserTonightExperience mode="rehearsal" adapter={adapters.user} />}
          {role === 'partner' && <PartnerTonightConsole mode="rehearsal" adapter={adapters.partner} />}
          {role === 'admin' && <AdminTonightConsole mode="rehearsal" adapter={adapters.admin} />}
          {role === 'superAdmin' && <SuperAdminTonightConsole mode="rehearsal" adapter={adapters.superAdmin} />}
        </div>
      )}
    </div>
  )
}
