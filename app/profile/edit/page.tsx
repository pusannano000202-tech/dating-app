'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Crosshair, ClipboardList, Camera,
  Brain, CalendarDays, SlidersHorizontal, ChevronRight,
  Heart,
  AlertTriangle, Pencil, Check,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import { createClient } from '@/lib/supabase'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'
import type { AppearanceType, Gender } from '@/lib/types'

const EDIT_SECTIONS = [
  {
    href: '/profile/worldcup',
    icon: Crosshair,
    iconBg: 'from-boot-primary to-boot-coral',
    title: '이상형 스타일',
    desc: '선호하는 외모 타입 다시 고르기',
  },
  {
    href: '/profile/basic',
    icon: ClipboardList,
    iconBg: 'from-sky-500 to-cyan-400',
    title: '기본 정보',
    desc: '나이, 키, 학과 등 수정하기',
  },
  {
    href: '/profile/photos',
    icon: Camera,
    iconBg: 'from-boot-coral to-amber-400',
    title: '사진',
    desc: '프로필 사진 바꾸기',
  },
  {
    href: '/profile/survey',
    icon: Brain,
    iconBg: 'from-emerald-500 to-teal-400',
    title: '성격 테스트',
    desc: 'Big5 성격 테스트 다시 하기',
  },
  {
    href: '/profile/personality-preference',
    icon: Heart,
    iconBg: 'from-rose-500 to-boot-coral',
    title: '상대 성격 취향',
    desc: '끌리는 상대 성격 다시 고르기',
  },
  {
    href: '/profile/schedule',
    icon: CalendarDays,
    iconBg: 'from-boot-primary to-sky-500',
    title: '가능한 시간대',
    desc: '과팅 가능한 요일/시간 수정',
  },
  {
    href: '/profile/preferences',
    icon: SlidersHorizontal,
    iconBg: 'from-amber-400 to-boot-coral',
    title: '매칭 가중치',
    desc: '중요하게 보는 조건 조정하기',
  },
]

interface ProfileSummary {
  display_name: string | null
  gender: Gender | null
  age: number | null
  school: string | null
  department: string | null
  appearance_type: AppearanceType | null
  photo_count: number
}

export default function ProfileEditPage() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const [{ data: profile }, { count }] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, gender, age, school, department, appearance_type')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ])
      if (profile) {
        setSummary({
          display_name: profile.display_name ?? null,
          gender: profile.gender as Gender | null,
          age: profile.age,
          school: profile.school,
          department: profile.department,
          appearance_type: profile.appearance_type as AppearanceType | null,
          photo_count: count ?? 0,
        })
      }
    })
  }, [])

  function startEditName() {
    if (!summary) return
    setNameDraft(summary.display_name ?? '')
    setNameError(null)
    setEditingName(true)
  }

  async function saveDisplayName() {
    if (savingName) return
    const trimmed = nameDraft.trim()
    if (trimmed.length < 2 || trimmed.length > 20) {
      setNameError('이름은 2~20자 사이로 입력해줘.')
      return
    }
    setSavingName(true)
    setNameError(null)
    try {
      const res = await fetch('/api/profiles/claim-nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: trimmed }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setNameError(translateNicknameClaimError(data.error))
        return
      }
      setSummary((s) => s ? { ...s, display_name: trimmed } : s)
      setEditingName(false)
    } catch {
      setNameError('저장에 실패했어요. 잠시 후 다시 시도해줘.')
    } finally {
      setSavingName(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await supabase.from('profiles').delete().eq('user_id', user.id)
      await supabase.from('photos').delete().eq('user_id', user.id)
      router.push('/profile/worldcup')
    } catch {
      setResetting(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen booting-band px-5 pb-10 text-boot-ink">
      {/* 헤더 */}
      <div className="relative pt-6 mb-7 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 glass rounded-xl border border-boot-hairline text-boot-body hover:text-boot-primary">
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div>
          <h1 className="text-xl font-black">부팅 프로필 수정</h1>
          <p className="text-xs text-boot-muted mt-0.5">수정할 항목을 골라줘</p>
        </div>
      </div>

      {/* 프로필 요약 카드 — 로딩 스켈레톤 */}
      {!summary && (
        <div className="glass-card rounded-2xl border border-boot-hairline p-4 mb-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-boot-soft flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-boot-hairline rounded w-3/4" />
              <div className="h-3 bg-boot-hairline/70 rounded w-1/2" />
              <div className="flex gap-2 mt-1">
                <div className="h-4 bg-boot-hairline rounded-full w-20" />
                <div className="h-4 bg-boot-hairline/70 rounded-full w-14" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 프로필 요약 카드 */}
      {summary && (
        <div className="relative glass-card rounded-2xl border border-boot-hairline p-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <BootingLogo size="sm" showSubtitle={false} />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="mb-1">
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={20}
                      autoFocus
                      placeholder="2~20자"
                      className="flex-1 min-w-0 rounded-lg border border-boot-hairline bg-white px-2 py-1 text-sm font-bold text-boot-ink focus:outline-none focus:border-boot-primary"
                    />
                    <button
                      type="button"
                      onClick={saveDisplayName}
                      disabled={savingName}
                      className="p-1.5 rounded-lg bg-boot-soft border border-boot-primary/30 text-boot-primary disabled:opacity-50"
                      aria-label="저장"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingName(false); setNameError(null) }}
                      disabled={savingName}
                      className="p-1.5 rounded-lg text-boot-muted hover:text-boot-body"
                      aria-label="취소"
                    >
                      ✕
                    </button>
                  </div>
                  {nameError && (
                    <p className="mt-1 text-[10px] text-red-400">{nameError}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-base font-black truncate">
                    {summary.display_name ?? '이름을 입력해주세요'}
                  </p>
                  <button
                    type="button"
                    onClick={startEditName}
                    className="p-1 rounded text-boot-muted hover:text-boot-primary"
                    aria-label="이름 수정"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              <p className="text-sm font-bold">
                {summary.gender === 'male' ? '남' : summary.gender === 'female' ? '여' : '?'}
                {summary.age != null ? ` · ${summary.age}세` : ''}
                {summary.school ? ` · ${summary.school}` : ''}
              </p>
              {summary.department && (
                <p className="text-xs text-boot-muted mt-0.5 truncate">{summary.department}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {summary.appearance_type && (
                  <span className="text-[10px] bg-boot-soft text-boot-primary rounded-full px-2 py-0.5">
                    {APPEARANCE_TYPE_INFO[summary.appearance_type].label} 스타일 선호
                  </span>
                )}
                <span className="text-[10px] bg-white/80 text-boot-muted rounded-full px-2 py-0.5 border border-boot-hairline">
                  사진 {summary.photo_count}장
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 수정 섹션 리스트 */}
      <div className="relative flex flex-col gap-2.5">
        {EDIT_SECTIONS.map(({ href, icon: Icon, iconBg, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="glass-card rounded-2xl px-4 py-3.5 flex items-center gap-4 hover:border-boot-primary/30 border border-boot-hairline transition-all hover:bg-white/95 active:scale-[0.99]"
          >
            {/* 컬러 아이콘 박스 */}
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center flex-shrink-0 shadow-lg`}>
              <Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{title}</p>
              <p className="text-xs text-boot-muted mt-0.5">{desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-boot-muted flex-shrink-0" />
          </Link>
        ))}

        {/* 위험 구역 */}
        <div className="mt-3 pt-4 border-t border-boot-hairline">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full py-3.5 rounded-2xl text-sm text-red-400 glass border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 transition-all flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              프로필 초기화
            </button>
          ) : (
            <div className="glass-card rounded-2xl p-4 border border-red-500/30">
              <p className="text-sm font-bold text-red-400 mb-1">정말 초기화할 거야?</p>
              <p className="text-xs text-boot-muted mb-4">프로필 정보가 모두 삭제돼. 되돌릴 수 없어.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl glass text-sm font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-sm font-bold text-red-400 disabled:opacity-50"
                >
                  {resetting ? '초기화 중...' : '초기화'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function translateNicknameClaimError(code?: string): string {
  switch (code) {
    case 'nickname_taken':
      return '이미 사용 중인 이름이에요.'
    case 'invalid_nickname':
      return '이름은 2~20자 사이로 입력해줘.'
    default:
      return '저장에 실패했어요. 잠시 후 다시 시도해줘.'
  }
}
