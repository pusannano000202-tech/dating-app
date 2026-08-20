'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react'

type PhotoIssueCode =
  | 'photo_no_face'
  | 'photo_multiple_people'
  | 'photo_face_occluded'
  | 'photo_low_quality'
  | 'photo_minor_suspected'

type GateState = 'idle' | 'loading' | 'photo_required' | 'photo_invalid' | 'error'

type ScoreResponse = {
  status?: string
  code?: string
  self_appearance_score_persisted?: boolean
}

const PHOTO_ISSUE_MESSAGES: Record<PhotoIssueCode, string> = {
  photo_no_face: '얼굴이 잘 보이는 본인 사진을 1장 이상 올려 주세요.',
  photo_multiple_people: '본인만 나온 사진을 1장 이상 올려 주세요.',
  photo_face_occluded: '모자나 손에 가리지 않고 얼굴이 잘 보이는 사진을 올려 주세요.',
  photo_low_quality: '흐리거나 너무 어두운 사진 대신 얼굴이 선명한 사진을 올려 주세요.',
  photo_minor_suspected: '성인 여부를 확인할 수 있는 최근 본인 사진을 올려 주세요.',
}

export default function AppearanceScoreGate({
  eventTitle,
  eventMeta,
  initialPhotoIssueCode = null,
}: {
  eventTitle?: string
  eventMeta?: string
  initialPhotoIssueCode?: PhotoIssueCode | null
}) {
  const router = useRouter()
  const [state, setState] = useState<GateState>(initialPhotoIssueCode ? 'photo_invalid' : 'idle')
  const [photoIssueCode, setPhotoIssueCode] = useState<PhotoIssueCode | null>(initialPhotoIssueCode)

  async function prepareForMatching() {
    if (state === 'loading') return
    setPhotoIssueCode(null)
    setState('loading')

    try {
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'match_search' }),
      })
      const data = await readScoreResponse(response)

      if (response.ok && data?.self_appearance_score_persisted === true) {
        router.refresh()
        return
      }

      if (data?.code === 'photo_required') {
        setState('photo_required')
      } else if (isPhotoIssueCode(data?.code)) {
        setPhotoIssueCode(data.code)
        setState('photo_invalid')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-6">
          <p className="text-xs font-black text-boot-primary">QUANTUM · 매칭 준비</p>
          <h1 className="mt-2 text-2xl font-black">마지막 준비만 할게요</h1>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            가입만 한 사용자의 사진은 분석하지 않아요. 매칭 찾기를 시작하는 지금 한 번만 준비합니다.
          </p>
        </header>

        {eventTitle && (
          <section className="mb-5 border-l-4 border-boot-primary bg-white px-4 py-4">
            <p className="text-[11px] font-black text-boot-primary">선택한 약속</p>
            <h2 className="mt-1 text-lg font-black">{eventTitle}</h2>
            {eventMeta && <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">{eventMeta}</p>}
          </section>
        )}

        <section className="rounded-3xl border border-boot-primary/20 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <ShieldCheck size={26} strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-black">내부 매칭 기준 만들기</h2>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            결과 점수는 사용자나 상대에게 공개하지 않고, 조건이 맞는 팀을 찾는 데만 사용해요.
          </p>

          {(state === 'photo_required' || state === 'photo_invalid') && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              {photoIssueCode
                ? PHOTO_ISSUE_MESSAGES[photoIssueCode]
                : '분석할 대표 사진이 필요해요. 사진을 저장한 뒤 다시 시작해 주세요.'}
            </div>
          )}
          {state === 'error' && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              지금은 준비를 끝내지 못했어요. 잠시 후 다시 시도해 주세요.
            </div>
          )}

          {state === 'photo_required' || state === 'photo_invalid' ? (
            <Link
              href="/profile/photos"
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-boot-ink px-5 py-4 text-sm font-black text-white"
            >
              {state === 'photo_invalid' ? '사진 다시 선택하기' : '사진 등록하기'}
              <ArrowRight size={17} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={prepareForMatching}
              disabled={state === 'loading'}
              className="btn-gradient-animated mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black disabled:cursor-wait disabled:opacity-70"
            >
              {state === 'loading' ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  매칭 기준 준비 중
                </>
              ) : (
                <>
                  매칭 찾기 계속하기
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          )}
        </section>
      </div>
    </main>
  )
}

async function readScoreResponse(response: Response): Promise<ScoreResponse | null> {
  try {
    return await response.json() as ScoreResponse
  } catch {
    return null
  }
}

function isPhotoIssueCode(code: string | undefined): code is PhotoIssueCode {
  return code === 'photo_no_face'
    || code === 'photo_multiple_people'
    || code === 'photo_face_occluded'
    || code === 'photo_low_quality'
    || code === 'photo_minor_suspected'
}
