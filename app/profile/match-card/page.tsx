'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, StickyNote } from 'lucide-react'
import DailyCardHintWizard from '@/components/matching/DailyCardHintWizard'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { PageShell } from '@/components/ui/PageShell'
import {
  buildDailyCardSubmissionText,
  countCompletedDailyCardItems,
  createDailyCardDraftFromSubmissionText,
  createEmptyDailyCardDraft,
  decodeDailyCardDebateAnswers,
  encodeDailyCardDebateAnswers,
  type DailyCardDraft,
  type DailyCardFieldId,
} from '@/lib/matching/daily-card-authoring'
import {
  getPreMatchCardDraftCookie,
} from '@/lib/matching/pre-match-card-draft'

const STORAGE_KEY = 'booting_pre_match_card_draft_text'
const SUBMITTED_AT_KEY = 'booting_pre_match_card_draft_submitted_at'
const MINIMUM_DAILY_CARD_ITEMS_TO_SAVE = 4
const TOTAL_DAILY_CARD_ITEMS = 6

export default function ProfileMatchCardPage() {
  const [draft, setDraft] = useState<DailyCardDraft>(() => createEmptyDailyCardDraft())
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedToServer, setSavedToServer] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const savedText = window.localStorage.getItem(STORAGE_KEY)
    if (savedText) {
      setDraft(createDailyCardDraftFromSubmissionText(savedText))
    }
    setSubmittedAt(window.localStorage.getItem(SUBMITTED_AT_KEY))

    let alive = true
    async function loadServerDraft() {
      try {
        const res = await fetch('/api/profile/match-card-draft', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as {
          draft?: { content_text?: string; submitted_at?: string | null } | null
        }
        if (!alive || !data.draft?.content_text) return
        window.localStorage.setItem(STORAGE_KEY, data.draft.content_text)
        if (data.draft.submitted_at) {
          window.localStorage.setItem(SUBMITTED_AT_KEY, data.draft.submitted_at)
        }
        document.cookie = getPreMatchCardDraftCookie()
        setDraft(createDailyCardDraftFromSubmissionText(data.draft.content_text))
        setSubmittedAt(data.draft.submitted_at ?? null)
        setSavedToServer(true)
      } catch {
        // 로그인 전 preview나 네트워크 오류에서는 기존 로컬 초안을 그대로 사용한다.
      }
    }

    void loadServerDraft()
    return () => {
      alive = false
    }
  }, [])

  const completedCount = countCompletedDailyCardItems(draft)
  const submissionText = useMemo(() => buildDailyCardSubmissionText(draft), [draft])
  const tooLong = submissionText.length > 500
  const canSave = completedCount >= MINIMUM_DAILY_CARD_ITEMS_TO_SAVE && !tooLong

  function updateDailyCardDraft(fieldId: DailyCardFieldId, value: string) {
    setDraft((current) => ({ ...current, [fieldId]: value }))
    setSaved(false)
    setSaveError(null)
  }

  function updateDailyCardDebateAnswer(promptId: string, value: string) {
    setDraft((current) => {
      const answers = decodeDailyCardDebateAnswers(current.debate)
      return {
        ...current,
        debate: encodeDailyCardDebateAnswers({
          ...answers,
          [promptId]: value,
        }),
      }
    })
    setSaved(false)
    setSaveError(null)
  }

  async function saveDraft() {
    if (!canSave || saving) return

    setSaving(true)
    setSaveError(null)

    const now = new Date().toISOString()
    let persistedSubmittedAt = now
    let persistedToServer = false

    try {
      const res = await fetch('/api/profile/match-card-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_text: submissionText }),
      })

      if (res.ok) {
        const data = await res.json() as {
          draft?: { submitted_at?: string | null } | null
        }
        persistedSubmittedAt = data.draft?.submitted_at ?? now
        persistedToServer = true
      } else if (res.status !== 401) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setSaveError(translateSaveError(data.error))
        setSaving(false)
        return
      }
    } catch {
      // 로컬 preview에서는 API 없이도 화면 검토가 가능해야 하므로 임시 저장으로 fallback한다.
    }

    window.localStorage.setItem(STORAGE_KEY, submissionText)
    window.localStorage.setItem(SUBMITTED_AT_KEY, persistedSubmittedAt)
    document.cookie = getPreMatchCardDraftCookie()
    setSubmittedAt(persistedSubmittedAt)
    setSavedToServer(persistedToServer)
    setSaved(true)
    setSaving(false)
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('redirect')
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
      return '/match/start'
    }
    return redirect
  }

  return (
    <PageShell>
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/match/start"
          className="glass rounded-xl border border-boot-hairline p-2 text-boot-body hover:text-boot-primary"
          aria-label="뒤로 가기"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-boot-primary">사전 카드 초안</p>
          <h1 className="text-2xl font-black">하루 한 장씩 열릴 대화 재료</h1>
          <p className="mt-0.5 text-xs leading-5 text-boot-muted">
            매칭 전에 6개 항목 중 4개 이상을 채우면 준비 단계로 넘어갈 수 있어요.
          </p>
        </div>
      </header>

      <Card variant="soft" className="mb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-boot-primary">
            <StickyNote size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black">내 카드 항목 {completedCount}/{TOTAL_DAILY_CARD_ITEMS} 완료</h2>
              <Chip tone={canSave ? 'success' : 'warning'}>
                {canSave ? '저장 가능' : `${MINIMUM_DAILY_CARD_ITEMS_TO_SAVE}개 필요`}
              </Chip>
            </div>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              음식점, 노래, 논쟁 카드처럼 상대가 눌러보고 대화하기 쉬운 재료를 먼저 만들어둡니다.
            </p>
          </div>
        </div>
      </Card>

      <DailyCardHintWizard
        draft={draft}
        completedCount={completedCount}
        minimumToSave={MINIMUM_DAILY_CARD_ITEMS_TO_SAVE}
        totalCount={TOTAL_DAILY_CARD_ITEMS}
        submittedAt={submittedAt}
        canSave={canSave}
        tooLong={tooLong}
        saving={saving}
        onTextChange={updateDailyCardDraft}
        onDebateAnswer={updateDailyCardDebateAnswer}
        onSave={saveDraft}
        formatSubmittedAt={formatSubmittedAt}
      />

      <div className="mt-4 grid gap-2">
        {saved && (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-xs font-bold text-emerald-700">
            {savedToServer
              ? '사전 카드 초안이 DB에 저장됐어요. 이제 매칭 찾기 준비로 돌아갈 수 있어요.'
              : '사전 카드 초안이 현재 기기에 임시 저장됐어요. 로컬 검토용으로 다음 단계를 볼 수 있어요.'}
          </p>
        )}
        {saveError && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-700">
            {saveError}
          </p>
        )}
        <ButtonLink
          href={saved ? getRedirectTarget() : '#'}
          onClick={(event) => {
            if (!saved) {
              event.preventDefault()
              void saveDraft()
            }
          }}
          variant={canSave ? 'gradient' : 'ghost'}
          size="lg"
          fullWidth
          aria-disabled={!canSave}
          className={!canSave ? 'pointer-events-none opacity-45' : ''}
        >
          {saved ? '매칭 준비로 돌아가기' : '저장하고 다음으로'}
          <ArrowRight size={17} />
        </ButtonLink>
        <p className="text-center text-[11px] leading-5 text-boot-muted">
          로그인 상태에서는 이 초안이 DB에 저장되어 그룹원이 모두 준비됐는지 확인하는 데 쓰여요.
          상대 공개용 카드는 가매칭 후 확정 카드 단계에서 따로 제출합니다.
        </p>
      </div>
    </PageShell>
  )
}

function translateSaveError(code?: string): string {
  switch (code) {
    case 'card_incomplete':
      return '사전 카드 항목을 4개 이상 채워야 저장할 수 있어요.'
    case 'invalid_card_content':
      return '카드 내용은 10자 이상 500자 이하로 작성해 주세요.'
    default:
      return '사전 카드 초안을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const date = d.getDate().toString().padStart(2, '0')
  const hour = d.getHours().toString().padStart(2, '0')
  const minute = d.getMinutes().toString().padStart(2, '0')
  return `${month}.${date} ${hour}:${minute}`
}
