'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Images,
  MessageCircle,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'

import BootingLogo from '@/components/BootingLogo'
import { createClient } from '@/lib/supabase'
import type { Gender } from '@/lib/types'

type ProfileSummary = {
  display_name: string | null
  gender: Gender | null
  age: number | null
  school: string | null
  department: string | null
  photo_count: number
}

type FriendSummary = {
  user_id: string
  display_name: string | null
  status: string
  photo_url: string | null
}

type FriendPendingRequest = {
  status: string
}

type FriendRequestPayload = {
  friends?: FriendSummary[]
  sent?: FriendPendingRequest[]
  received?: FriendPendingRequest[]
}

type FriendPendingCounts = {
  sentPending: number
  receivedPending: number
}

type GroupPayload = {
  group?: { id?: string } | null
}

type DepositSummaryPayload = {
  total_active?: number
  paid_count?: number
  all_paid?: boolean
  error?: string
}

type DepositSummaryState = {
  status: 'loading' | 'ready' | 'missing' | 'unavailable' | 'error'
  paidCount: number
  totalCount: number
  message?: string
}

const QUICK_ACTIONS = [
  { href: '/friends', icon: UsersRound, label: '친구 관리', tone: 'bg-boot-info-soft text-boot-info' },
  { href: '/chat', icon: MessageCircle, label: '채팅', tone: 'bg-[#EAF6F4] text-[#147A70]' },
  { href: '/notifications', icon: Bell, label: '알림', tone: 'bg-[#FFF5DE] text-[#A66B00]' },
  { href: '/match', icon: CircleDollarSign, label: '보증금', tone: 'bg-[#FFF0ED] text-[#C84C3E]' },
]

const INITIAL_DEPOSIT_SUMMARY: DepositSummaryState = {
  status: 'loading',
  paidCount: 0,
  totalCount: 0,
}

export default function ProfileEditPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [friends, setFriends] = useState<FriendSummary[]>([])
  const [friendPending, setFriendPending] = useState<FriendPendingCounts | null>(null)
  const [depositSummary, setDepositSummary] = useState<DepositSummaryState>(INITIAL_DEPOSIT_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    async function loadHub() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login?redirect=%2Fprofile%2Fedit')
        return
      }

      const [
        { data: profile },
        photoResponse,
        friendResponse,
        groupsResponse,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, gender, age, school, department')
          .eq('user_id', user.id)
          .single(),
        fetch('/api/profile/photos', { cache: 'no-store' }),
        fetch('/api/friend-requests', { cache: 'no-store' }),
        fetch('/api/groups', { cache: 'no-store' }),
      ])

      if (!active) return

      const photoPayload = photoResponse.ok
        ? await photoResponse.json().catch(() => null) as { photos?: string[] } | null
        : null
      const friendPayload = friendResponse.ok
        ? await friendResponse.json().catch(() => null) as FriendRequestPayload | null
        : null
      const groupsPayload = groupsResponse.ok
        ? await groupsResponse.json().catch(() => null) as GroupPayload | null
        : null

      const nextPhotos = Array.isArray(photoPayload?.photos) ? photoPayload.photos : []
      const sent = Array.isArray(friendPayload?.sent) ? friendPayload.sent : null
      const received = Array.isArray(friendPayload?.received) ? friendPayload.received : null

      setPhotos(nextPhotos)
      setFriends(Array.isArray(friendPayload?.friends) ? friendPayload.friends : [])
      setFriendPending(sent || received ? {
        sentPending: sent ? sent.filter((row) => row.status === 'pending').length : 0,
        receivedPending: received ? received.filter((row) => row.status === 'pending').length : 0,
      } : null)

      const nextDepositSummary = await loadDepositSummary(groupsPayload)
      if (active) {
        setDepositSummary(nextDepositSummary)
      }

      if (profile) {
        setSummary({
          display_name: profile.display_name ?? null,
          gender: profile.gender as Gender | null,
          age: profile.age,
          school: profile.school,
          department: profile.department,
          photo_count: nextPhotos.length,
        })
      }
      setLoading(false)
    }

    void loadHub().catch(() => {
      if (!active) return
      setDepositSummary({
        status: 'error',
        paidCount: 0,
        totalCount: 0,
        message: '마이 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요.',
      })
      setLoading(false)
    })
    return () => { active = false }
  }, [router])

  async function handleReset() {
    setResetting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const photoResponse = await fetch('/api/profile/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!photoResponse.ok && photoResponse.status !== 404) {
        throw new Error('profile_photo_reset_failed')
      }
      router.push('/profile/basic')
    } finally {
      setResetting(false)
      setShowConfirm(false)
    }
  }

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-4xl px-4 pt-5 sm:px-6 sm:pt-7">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로 가기"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-muted"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-xs font-black text-boot-info">QUANTUM MY</p>
            <h1 className="mt-0.5 text-2xl font-black">마이</h1>
          </div>
        </header>

        {loading ? <ProfileSkeleton /> : (
          <>
            <section className="mt-5 grid gap-4 border-y border-boot-hairline py-5 sm:grid-cols-[132px_minmax(0,1fr)]">
              <Link
                href="/profile/photos"
                aria-label="내 프로필 사진 바꾸기"
                className="group relative mx-auto aspect-[4/5] w-28 overflow-hidden rounded-lg bg-[#E8EFEC] sm:mx-0 sm:w-32"
              >
                {photos[0] ? (
                  <Image src={photos[0]} alt="내 프로필 사진" fill priority sizes="128px" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center"><BootingLogo size="sm" showSubtitle={false} /></span>
                )}
                <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white">
                  <Camera size={17} />
                </span>
              </Link>

              <div className="flex min-w-0 flex-col justify-center">
                <Link href="/profile/basic" className="group flex items-start justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black">{summary?.display_name ?? '프로필을 완성해 주세요'}</p>
                    <p className="mt-1 text-sm font-bold text-boot-muted">
                      {genderLabel(summary?.gender)}{summary?.age ? ` · ${summary.age}세` : ''}{summary?.school ? ` · ${summary.school}` : ''}
                    </p>
                    {summary?.department ? <p className="mt-1 truncate text-sm font-bold text-boot-muted">{summary.department}</p> : null}
                  </div>
                  <ChevronRight size={18} className="mt-1 shrink-0 text-boot-muted" />
                </Link>
                <p className="mt-4 text-xs font-bold leading-5 text-boot-muted">사진이나 이름을 누르면 바로 프로필을 바꿀 수 있어요.</p>
              </div>
            </section>

            <section className="grid grid-cols-3 border-b border-boot-hairline" aria-label="내 활동 요약">
              <SummaryLink href="/friends" value={`${friends.length}`} label="친구" />
              <SummaryLink href="/profile/photos" value={`${summary?.photo_count ?? 0}`} label="내 프로필 사진" />
              <SummaryLink
                href="/match"
                value={depositSummaryLabel(depositSummary)}
                label="보증금"
                tone={depositSummaryTone(depositSummary)}
              />
            </section>

            <section className="mt-3 grid grid-cols-4 gap-2">
              {QUICK_ACTIONS.map(({ href, icon: Icon, label, tone }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-center text-xs font-black ${tone}`}
                >
                  <Icon size={18} />
                  <span className="leading-tight">{label}</span>
                </Link>
              ))}
            </section>

            <section className="py-6" aria-labelledby="friends-heading">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="friends-heading" className="text-lg font-black">내 친구</h2>
                  <p className="mt-1 text-xs font-bold text-boot-muted">같이 모임에 초대하거나 1:1 약속을 보낼 수 있어요.</p>
                </div>
                <Link href="/friends" className="flex min-h-11 items-center gap-1 text-xs font-black text-boot-info">전체 보기 <ChevronRight size={15} /></Link>
              </div>
              {friendPending !== null ? (
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black text-boot-muted">
                  <span className="rounded-full border border-boot-hairline bg-white px-3 py-1.5">받은 제안 {friendPending.receivedPending}건</span>
                  <span className="rounded-full border border-boot-hairline bg-white px-3 py-1.5">보낸 제안 {friendPending.sentPending}건</span>
                </div>
              ) : null}
              {friends.length ? (
                <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
                  {friends.slice(0, 8).map((friend) => (
                    <Link key={friend.user_id} href={`/friends/${friend.user_id}`} className="w-16 shrink-0 text-center">
                      <span className="relative mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-boot-info-soft text-lg font-black text-boot-info">
                        {friend.photo_url ? <Image src={friend.photo_url} alt="" fill sizes="64px" className="object-cover" /> : initials(friend.display_name)}
                      </span>
                      <span className="mt-2 block truncate text-xs font-black">{friend.display_name ?? '친구'}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Link href="/friends" className="mt-4 flex min-h-20 items-center gap-3 rounded-lg bg-white px-4">
                  <UsersRound className="text-boot-info" size={22} />
                  <span><span className="block text-sm font-black">아직 친구가 없어요</span><span className="mt-1 block text-xs font-bold text-boot-muted">친구를 찾아 다음 모임에 같이 참여해 보세요.</span></span>
                </Link>
              )}
            </section>

            <section className="border-t border-boot-hairline py-6" aria-labelledby="photos-heading">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="photos-heading" className="text-lg font-black">내 프로필 사진</h2>
                  <p className="mt-1 text-xs font-bold text-boot-muted">직접 올린 프로필 사진만 보여요.</p>
                </div>
                <Link href="/profile/photos" className="flex min-h-11 items-center gap-1 text-xs font-black text-boot-info">사진 관리 <ChevronRight size={15} /></Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {photos.slice(0, 3).map((photo, index) => (
                  <Link key={photo} href="/profile/photos" className="relative aspect-square overflow-hidden rounded-lg bg-[#E8EFEC]">
                    <Image src={photo} alt={`프로필 사진 ${index + 1}`} fill sizes="(max-width: 640px) 30vw, 180px" className="object-cover" />
                  </Link>
                ))}
                {photos.length === 0 ? (
                  <Link href="/profile/photos" className="col-span-3 flex min-h-28 items-center justify-center gap-2 rounded-lg border border-dashed border-boot-hairline bg-white text-sm font-black text-boot-info"><Images size={20} /> 첫 사진 올리기</Link>
                ) : null}
              </div>
            </section>

            <section className="border-t border-boot-hairline py-6" aria-labelledby="memories-heading">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="memories-heading" className="text-lg font-black">만남 사진첩</h2>
                  <p className="mt-1 text-xs font-bold text-boot-muted">참가자 전용 만남 사진첩은 서버 연결 후 이곳에 모여요.</p>
                </div>
                <Link href="/match" className="flex min-h-11 items-center gap-1 text-xs font-black text-boot-info">만남 보기 <ChevronRight size={15} /></Link>
              </div>
              <Link
                href="/match"
                className="mt-4 flex min-h-28 items-center justify-center gap-2 rounded-lg border border-dashed border-boot-hairline bg-white text-sm font-black text-boot-info"
              >
                <Images size={20} /> 만남 사진첩 연결 준비 중
              </Link>
            </section>

            <section className="border-t border-boot-hairline py-6">
              <h2 className="text-lg font-black">보증금 상태</h2>
              <p className="mt-1 text-xs font-bold text-boot-muted">
                {depositSummaryMessage(depositSummary)}
              </p>
              <p className={`mt-3 text-sm font-black ${depositSummaryTone(depositSummary)}`}>
                {depositSummaryLabel(depositSummary)}
              </p>
            </section>

            <section className="flex items-start gap-3 border-y border-[#CBE3DD] bg-[#EAF6F4] px-4 py-4">
              <ShieldCheck className="mt-0.5 shrink-0 text-[#147A70]" size={20} />
              <div><p className="text-sm font-black text-[#0D514A]">신고와 안전 도움</p><p className="mt-1 text-xs font-bold leading-5 text-[#356D67]">만남 상세에서 신고할 수 있고, 긴급한 상황은 112·119에 먼저 연락해 주세요.</p></div>
            </section>

            <div className="py-6">
              {!showConfirm ? (
                <button type="button" onClick={() => setShowConfirm(true)} className="flex min-h-11 w-full items-center justify-center gap-2 text-xs font-black text-[#B44236]"><AlertTriangle size={16} /> 프로필 초기화</button>
              ) : (
                <div className="rounded-lg border border-[#F1B4AD] bg-white p-4">
                  <p className="text-sm font-black">프로필을 처음부터 다시 만들까요?</p>
                  <p className="mt-1 text-xs font-bold text-boot-muted">저장된 기본정보와 사진이 삭제되며 되돌릴 수 없어요.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setShowConfirm(false)} className="min-h-11 rounded-lg border border-boot-hairline text-sm font-black">취소</button>
                    <button type="button" onClick={() => void handleReset()} disabled={resetting} className="min-h-11 rounded-lg bg-[#B44236] text-sm font-black text-white disabled:opacity-50">{resetting ? '초기화 중...' : '초기화'}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function SummaryLink({ href, value, label, tone }: { href: string; value: string; label: string; tone?: string }) {
  return (
    <Link href={href} className="flex min-h-20 flex-col items-center justify-center border-r border-boot-hairline last:border-r-0">
      <strong className={`text-lg font-black ${tone ?? 'text-boot-info'}`}>{value}</strong>
      <span className="mt-1 text-xs font-bold text-boot-muted">{label}</span>
    </Link>
  )
}

function ProfileSkeleton() {
  return <div className="mt-5 h-72 animate-pulse rounded-lg bg-white" aria-label="프로필을 불러오는 중" />
}

function genderLabel(gender?: Gender | null) {
  if (gender === 'male') return '남'
  if (gender === 'female') return '여'
  return '성별 미입력'
}

function initials(name: string | null) {
  return name?.trim().slice(0, 1) || 'Q'
}

function depositSummaryLabel(summary: DepositSummaryState) {
  if (summary.status === 'ready') return '준비 완료'
  if (summary.status === 'missing') return '미등록'
  if (summary.status === 'error') return '조회 실패'
  if (summary.status === 'unavailable') return '조회 불가'
  return '조회 중'
}

function depositSummaryTone(summary: DepositSummaryState) {
  if (summary.status === 'ready') return 'text-[#147A70]'
  if (summary.status === 'missing') return 'text-[#B44236]'
  if (summary.status === 'error' || summary.status === 'unavailable') return 'text-[#8A6B00]'
  return 'text-boot-muted'
}

function depositSummaryMessage(summary: DepositSummaryState) {
  if (summary.status === 'loading') return '보증금 상태를 조회하고 있어요.'
  if (summary.status === 'error') return summary.message ?? '보증금 상태 조회에 실패했어요.'
  if (summary.message && (summary.status === 'unavailable' || summary.status === 'missing' || summary.status === 'ready')) {
    return summary.message
  }
  return `${summary.paidCount}/${summary.totalCount}명 기준`
}

async function loadDepositSummary(groupsPayload: GroupPayload | null): Promise<DepositSummaryState> {
  const groupId = groupsPayload?.group?.id
  if (!groupId) {
    return { status: 'unavailable', paidCount: 0, totalCount: 0, message: '그룹이 없어 보증금 상태를 확인할 수 없어요.' }
  }

  const response = await fetch(`/api/deposits/summary?group_id=${encodeURIComponent(groupId)}`, { cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    return {
      status: 'error',
      paidCount: 0,
      totalCount: 0,
      message: payload?.error ?? '보증금 상태를 불러오지 못했어요.',
    }
  }

  const payload = await response.json().catch(() => null) as DepositSummaryPayload | null
  if (!payload || typeof payload.total_active !== 'number' || typeof payload.paid_count !== 'number') {
    return {
      status: 'error',
      paidCount: 0,
      totalCount: 0,
      message: '보증금 응답 형식이 예상과 달라요.',
    }
  }

  if (payload.total_active <= 0) {
    return {
      status: 'unavailable',
      paidCount: payload.paid_count,
      totalCount: payload.total_active,
      message: '아직 보증금이 필요한 매칭이 없어요.',
    }
  }

  return {
    status: payload.all_paid || payload.paid_count === payload.total_active ? 'ready' : 'missing',
    paidCount: payload.paid_count,
    totalCount: payload.total_active,
  }
}
