'use client'

import { ArrowRight, CheckCircle2, HeartHandshake, MessagesSquare } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BasicInfoConversation from '@/components/profile/BasicInfoConversation'
import type { BasicInfoData } from '@/components/profile/BasicInfoForm'
import type { CommunityGender } from '@/lib/profile/eligibility'
import { parseSharedMeetupReturn, sharedMeetupProfileHref } from '@/lib/auth/shared-meetup-return'

const PROFILE_LOAD_TIMEOUT_MS = 10_000

export default function BasicInfoPage() {
  return <Suspense fallback={<p role="status" className="p-8">가입 정보를 불러오고 있어요.</p>}><BasicInfoContent /></Suspense>
}

function BasicInfoContent() {
  const router = useRouter()
  const params = useSearchParams()
  const sharedRoom = parseSharedMeetupReturn(params.get('next'))
  const resumePath = sharedRoom ? sharedMeetupProfileHref(sharedRoom) : '/profile/basic'
  const loginPath = `/login?redirect=${encodeURIComponent(resumePath)}`
  const [initialData, setInitialData] = useState<Partial<BasicInfoData> | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [completedGender, setCompletedGender] = useState<CommunityGender | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProfile() {
      setLoaded(false); setLoadError(null)
      try {
        const response = await withTimeout(fetch('/api/profile/basic', { cache: 'no-store', signal: controller.signal }), PROFILE_LOAD_TIMEOUT_MS)
        if (response.status === 401) { router.replace(loginPath); return }
        if (!response.ok) throw new Error('profile_load_failed')
        const payload = await response.json() as { profile?: Partial<BasicInfoData> }
        setInitialData(payload.profile ?? {})
      } catch (error) {
        if (!controller.signal.aborted) setLoadError('프로필 정보를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
      } finally { if (!controller.signal.aborted) setLoaded(true) }
    }
    void loadProfile()
    return () => controller.abort()
  }, [loadAttempt, router, loginPath])

  async function handleSubmit(data: BasicInfoData) {
    setSaving(true); setServerError(null)
    try {
      const response = await fetch('/api/profile/basic', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (response.status === 401) { router.replace(loginPath); return }
      if (!response.ok) { setServerError(translateBasicProfileSaveError(payload.error)); return }
      setCompletedGender(data.gender)
    } catch { setServerError('저장 중 오류가 생겼어요. 잠시 뒤 다시 시도해 주세요.') }
    finally { setSaving(false) }
  }

  if (completedGender) return <CompletionChoice gender={completedGender} sharedRoom={sharedRoom} />

  return <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 pb-28 pt-8">
    <header className="mb-7"><p className="text-xs font-black text-boot-primary">QUANTUM · 최소 가입</p><h1 className="mt-2 text-2xl font-black text-boot-ink">{sharedRoom ? '초대받은 모임에 갈 준비를 해요' : '커뮤니티에 들어갈 준비를 해요'}</h1><p className="mt-2 text-sm leading-6 text-boot-muted">휴대폰 인증과 꼭 필요한 정보만 저장해요. 월드컵과 사진은 가입 뒤 선택할 수 있어요.</p>{sharedRoom?<p className="mt-3 text-sm font-bold text-boot-primary">가입을 마치면 원래 초대받은 모임으로 돌아갈 수 있어요.</p>:null}</header>
    {loaded && loadError ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4"><p className="text-sm font-black text-rose-800">프로필을 불러오지 못했어요</p><p className="mt-1 text-sm leading-6 text-rose-700">{loadError}</p><button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-4 min-h-11 rounded-lg border border-rose-300 bg-white px-4 text-sm font-black text-rose-800">다시 불러오기</button></div> : loaded ? <BasicInfoConversation key={initialData ? 'loaded' : 'empty'} initialValue={initialData} onSubmit={handleSubmit} saving={saving} serverError={serverError} /> : <div className="flex animate-pulse flex-col gap-4">{[1,2,3].map((item) => <div key={item} className="h-14 rounded-lg bg-boot-soft" />)}</div>}
  </div>
}

function CompletionChoice({ gender, sharedRoom }: { gender: CommunityGender; sharedRoom: string | null }) {
  const matchingSupported = gender === 'male' || gender === 'female'
  if(sharedRoom)return <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12"><CheckCircle2 size={52} className="text-emerald-600"/><p className="mt-5 text-xs font-black text-boot-primary">최소 가입 완료</p><h1 className="mt-2 text-2xl font-black text-boot-ink">초대받은 모임으로 돌아가요</h1><p className="mt-3 text-sm leading-6 text-boot-muted">모집방에서 활동과 참여 조건을 확인하고 참가 신청해 주세요. 가입만으로 모임에 참여되는 것은 아니에요.</p><Link href={sharedRoom} className="mt-8 flex min-h-14 items-center justify-between rounded-xl bg-boot-primary px-5 font-black text-white">초대받은 모임 확인하기<ArrowRight size={18}/></Link><Link href="/community" className="mt-3 inline-flex min-h-11 items-center justify-center text-sm font-bold text-boot-muted">커뮤니티 둘러보기</Link></main>
  return <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12"><CheckCircle2 size={52} className="text-emerald-600" /><p className="mt-5 text-xs font-black text-boot-primary">최소 가입 완료</p><h1 className="mt-2 text-2xl font-black text-boot-ink">이제 커뮤니티를 둘러볼 수 있어요</h1><p className="mt-3 text-sm font-bold leading-6 text-boot-muted">이상형 월드컵과 사진은 1:1 매칭을 준비할 때 이어서 하면 돼요.</p><div className="mt-8 space-y-3"><Link href="/community" className="flex min-h-16 items-center gap-3 rounded-xl bg-boot-primary px-4 text-white"><MessagesSquare size={21} /><span className="flex-1"><strong className="block text-sm">커뮤니티 먼저 둘러보기</strong><span className="mt-1 block text-xs font-bold opacity-80">월드컵·사진 없이 바로 시작</span></span><ArrowRight size={18} /></Link>{matchingSupported ? <Link href="/profile/worldcup" className="flex min-h-16 items-center gap-3 rounded-xl border border-boot-primary/30 bg-white px-4 text-boot-primary"><HeartHandshake size={21} /><span className="flex-1"><strong className="block text-sm">매칭 준비 계속하기</strong><span className="mt-1 block text-xs font-bold text-boot-muted">이상형 월드컵부터 시작</span></span><ArrowRight size={18} /></Link> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold leading-6 text-amber-800">현재 1:1 매칭은 남자·여자 선택 이용자부터 지원해요. 커뮤니티는 동일하게 이용할 수 있어요.</div>}</div></main>
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => { const id = window.setTimeout(() => reject(new Error('profile_load_timeout')), timeoutMs); promise.then((value) => { window.clearTimeout(id); resolve(value) }, (error) => { window.clearTimeout(id); reject(error) }) })
}

function translateBasicProfileSaveError(code?: string): string {
  switch (code) {
    case 'alias_taken': return '방금 다른 사람이 선택한 별칭이에요. 다른 이름 보기를 눌러 다시 골라주세요.'
    case 'alias_ticket_invalid': case 'invalid_alias_ticket': return '별칭 선택 시간이 지났어요. 다른 이름 보기를 눌러 다시 골라주세요.'
    case 'invalid_age': return '가입할 수 있는 나이는 만 19~35세예요.'
    case 'phone_verification_required': return '휴대폰 인증이 확인되지 않았어요. 첫 단계에서 다시 인증해 주세요.'
    case 'unauthorized': return '로그인 시간이 만료됐어요. 다시 로그인해 주세요.'
    default: return '가입 정보를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  }
}
