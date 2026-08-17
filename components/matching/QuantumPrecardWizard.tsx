'use client'

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Headphones,
  HeartHandshake,
  MessageCircleMore,
  Music2,
  Save,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  QUANTUM_PRECARD_CONVERSATION_OPTIONS,
  QUANTUM_PRECARD_INTEREST_OPTIONS,
  QUANTUM_PRECARD_MBTI_OPTIONS,
  QUANTUM_PRECARD_PLAN_OPTIONS,
  QUANTUM_PRECARD_ROLE_OPTIONS,
  countCompletedQuantumPrecardSections,
  getQuantumPrecardChoiceLabel,
  type QuantumPrecardDraft,
} from '@/lib/matching/quantum-precard'

const STEPS = [
  { label: '첫인상', hint: '처음 만날 때의 나를 한 문장으로 보여줘요.' },
  { label: '대화', hint: '대화할 때 편한 속도와 약속 스타일을 골라요.' },
  { label: '관심사', hint: '같이 이야기하고 싶은 주제를 3~5개 골라요.' },
  { label: '음악', hint: '요즘 자주 듣는 음악을 짧게 적어요.' },
  { label: '밸런스', hint: '가볍게 웃으며 시작할 선택 두 개예요.' },
  { label: '역할', hint: '오늘 모임에서 자연스럽게 맡고 싶은 역할을 골라요.' },
] as const

export default function QuantumPrecardWizard({
  draft,
  saving,
  saveError,
  onChange,
  onSave,
}: {
  draft: QuantumPrecardDraft
  saving: boolean
  saveError: string | null
  onChange: (draft: QuantumPrecardDraft) => void
  onSave: () => void
}) {
  const [step, setStep] = useState(0)
  const completed = countCompletedQuantumPrecardSections(draft)
  const isLast = step === STEPS.length - 1
  const canAdvance = isStepComplete(step, draft)
  const completionPercent = Math.round((completed / 7) * 100)

  const previewInterests = useMemo(
    () => draft.interests.length > 0 ? draft.interests : ['관심사 선택 전'],
    [draft.interests],
  )

  function patchDraft(patch: Partial<QuantumPrecardDraft>) {
    onChange({ ...draft, ...patch })
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[#E8CEC7] bg-[#FFFDFB] shadow-[0_18px_45px_rgba(91,57,50,0.08)]">
      <header className="border-b border-[#EEDDD8] bg-[#FFF4F0] px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-[#C24F43]">B · 설렘 밸런스 카드</p>
            <h2 className="mt-1 text-xl font-black text-[#241B19]">얼굴보다 먼저, 대화할 이유를 만들어요</h2>
          </div>
          <span className="shrink-0 text-sm font-black text-[#C24F43]">{completed}/7</span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white" aria-label={`사전 카드 ${completionPercent}% 완료`}>
          <div className="h-full rounded-full bg-[#C94D40] transition-[width] duration-300" style={{ width: `${completionPercent}%` }} />
        </div>
      </header>

      <div className="px-5 py-5 sm:px-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F7E3DE] text-[#B84237]">
            <MessageCircleMore size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black text-[#B84237]">{step + 1} / {STEPS.length} · {STEPS[step].label}</p>
            <p className="mt-1 text-sm font-bold leading-6 text-[#74635F]">{STEPS[step].hint}</p>
          </div>
        </div>

        <div className="min-h-[370px]">
          {step === 0 ? (
            <div className="space-y-5">
              <FieldLabel label="나를 보여주는 한 문장" optional={false} />
              <textarea
                value={draft.intro}
                onChange={(event) => patchDraft({ intro: event.target.value.slice(0, 80) })}
                rows={4}
                placeholder="예: 처음에는 조용하지만 공통점을 찾으면 말이 많아져요."
                className="w-full resize-none rounded-lg border border-[#DCC8C2] bg-white px-4 py-4 text-base font-bold leading-7 text-[#241B19] outline-none transition focus:border-[#C94D40] focus:ring-2 focus:ring-[#C94D40]/15"
              />
              <p className="text-right text-xs font-bold text-[#8A7772]">{draft.intro.length}/80</p>
              <FieldLabel label="MBTI" optional />
              <select
                value={draft.mbti}
                onChange={(event) => patchDraft({ mbti: event.target.value })}
                className="min-h-12 w-full rounded-lg border border-[#DCC8C2] bg-white px-4 text-sm font-black text-[#3B2E2B] outline-none focus:border-[#C94D40] focus:ring-2 focus:ring-[#C94D40]/15"
              >
                <option value="">선택하지 않아도 돼요</option>
                {QUANTUM_PRECARD_MBTI_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-7">
              <ChoiceSection
                title="대화 에너지"
                value={draft.conversationEnergy}
                options={QUANTUM_PRECARD_CONVERSATION_OPTIONS}
                onChange={(value) => patchDraft({ conversationEnergy: value as QuantumPrecardDraft['conversationEnergy'] })}
              />
              <ChoiceSection
                title="약속 스타일"
                value={draft.planStyle}
                options={QUANTUM_PRECARD_PLAN_OPTIONS}
                onChange={(value) => patchDraft({ planStyle: value as QuantumPrecardDraft['planStyle'] })}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel label="관심사 3~5개" optional={false} />
                <span className="text-xs font-black text-[#C24F43]">{draft.interests.length}/5</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {QUANTUM_PRECARD_INTEREST_OPTIONS.map((interest) => {
                  const selected = draft.interests.includes(interest)
                  return (
                    <button
                      key={interest}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        const next = selected
                          ? draft.interests.filter((item) => item !== interest)
                          : draft.interests.length < 5 ? [...draft.interests, interest] : draft.interests
                        patchDraft({ interests: next })
                      }}
                      className={`min-h-12 rounded-lg border px-2 text-sm font-black transition ${selected ? 'border-[#C94D40] bg-[#C94D40] text-white shadow-sm' : 'border-[#E2D2CD] bg-white text-[#51413D] hover:border-[#D4887C]'}`}
                    >
                      {selected ? <Check size={15} className="mx-auto mb-1" aria-hidden="true" /> : null}
                      {interest}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F7E3DE] text-[#B84237]">
                <Headphones size={27} aria-hidden="true" />
              </div>
              <FieldLabel label="요즘 가장 자주 듣는 음악" optional={false} />
              <textarea
                value={draft.music}
                onChange={(event) => patchDraft({ music: event.target.value.slice(0, 60) })}
                rows={3}
                placeholder="예: 산책할 때 잔잔한 인디 팝과 R&B를 자주 들어요."
                className="w-full resize-none rounded-lg border border-[#DCC8C2] bg-white px-4 py-4 text-base font-bold leading-7 text-[#241B19] outline-none transition focus:border-[#C94D40] focus:ring-2 focus:ring-[#C94D40]/15"
              />
              <p className="text-right text-xs font-bold text-[#8A7772]">{draft.music.length}/60</p>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-7">
              <BalanceChoice
                title="민트초코"
                value={draft.mintChocolate}
                left="민초 가능"
                right="반민초"
                onChange={(value) => patchDraft({ mintChocolate: value })}
              />
              <BalanceChoice
                title="냉면"
                value={draft.naengmyeon}
                left="물냉"
                right="비냉"
                onChange={(value) => patchDraft({ naengmyeon: value })}
              />
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-5">
              <ChoiceSection
                title="오늘의 역할"
                value={draft.meetupRole}
                options={QUANTUM_PRECARD_ROLE_OPTIONS}
                columns={2}
                onChange={(value) => patchDraft({ meetupRole: value as QuantumPrecardDraft['meetupRole'] })}
              />
              <div className="rounded-lg border border-[#E6CEC7] bg-[#FFF6F2] p-4">
                <div className="flex items-center gap-2 text-[#B84237]">
                  <Sparkles size={17} aria-hidden="true" />
                  <p className="text-xs font-black">상대에게는 이렇게 보여요</p>
                </div>
                <p className="mt-3 text-base font-black leading-6 text-[#2C211F]">{draft.intro || '나를 보여주는 한 문장'}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {draft.mbti ? <PreviewChip text={draft.mbti} /> : null}
                  <PreviewChip text={getQuantumPrecardChoiceLabel('conversation', draft.conversationEnergy)} />
                  <PreviewChip text={getQuantumPrecardChoiceLabel('plan', draft.planStyle)} />
                  {previewInterests.map((interest) => <PreviewChip key={interest} text={interest} />)}
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm font-bold text-[#5F4E49]"><Music2 size={16} /> {draft.music || '음악 취향'}</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-[#5F4E49]"><UsersRound size={16} /> {getQuantumPrecardChoiceLabel('role', draft.meetupRole)}</p>
              </div>
            </div>
          ) : null}
        </div>

        {saveError ? <p role="alert" className="mb-4 rounded-lg border border-[#E8A69E] bg-[#FFF0ED] px-4 py-3 text-sm font-black text-[#A83D32]">{saveError}</p> : null}

        <div className="mt-6 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 border-t border-[#EEDDD8] pt-5">
          <button
            type="button"
            aria-label="이전 단계"
            disabled={step === 0 || saving}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            className="flex h-14 items-center justify-center rounded-lg border border-[#DCC8C2] bg-white text-[#5F4E49] disabled:opacity-30"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          {isLast ? (
            <button
              type="button"
              disabled={completed !== 7 || saving}
              onClick={onSave}
              className="flex h-14 items-center justify-center gap-2 rounded-lg bg-[#C94D40] px-5 text-base font-black text-white shadow-[0_10px_24px_rgba(179,65,54,0.22)] disabled:cursor-not-allowed disabled:bg-[#D9C8C4] disabled:shadow-none"
            >
              <Save size={18} aria-hidden="true" />
              {saving ? '카드 저장 중' : '카드 완성하고 참여 계속하기'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
              className="flex h-14 items-center justify-center gap-2 rounded-lg bg-[#2C211F] px-5 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-[#D9C8C4]"
            >
              다음
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function FieldLabel({ label, optional }: { label: string; optional: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm font-black text-[#2C211F]">{label}</p>
      <span className={`text-[10px] font-black ${optional ? 'text-[#8A7772]' : 'text-[#C24F43]'}`}>{optional ? '선택' : '필수'}</span>
    </div>
  )
}

function ChoiceSection({
  title,
  value,
  options,
  onChange,
  columns = 3,
}: {
  title: string
  value: string
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>
  onChange: (value: string) => void
  columns?: 2 | 3
}) {
  return (
    <div>
      <FieldLabel label={title} optional={false} />
      <div className={`mt-3 grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-14 rounded-lg border px-2 text-sm font-black transition ${selected ? 'border-[#C94D40] bg-[#C94D40] text-white shadow-sm' : 'border-[#E2D2CD] bg-white text-[#51413D] hover:border-[#D4887C]'}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BalanceChoice({
  title,
  value,
  left,
  right,
  onChange,
}: {
  title: string
  value: QuantumPrecardDraft['mintChocolate']
  left: string
  right: string
  onChange: (value: 'A' | 'B') => void
}) {
  return (
    <div>
      <FieldLabel label={title} optional={false} />
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-[#DFC9C3] bg-white p-1">
        {([['A', left], ['B', right]] as const).map(([choice, label]) => (
          <button
            key={choice}
            type="button"
            aria-pressed={value === choice}
            onClick={() => onChange(choice)}
            className={`min-h-14 rounded-md text-base font-black transition ${value === choice ? 'bg-[#C94D40] text-white shadow-sm' : 'text-[#5F4E49]'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PreviewChip({ text }: { text: string }) {
  return <span className="rounded-full border border-[#E1C5BE] bg-white px-2.5 py-1 text-[11px] font-black text-[#6D4D46]">{text}</span>
}

function isStepComplete(step: number, draft: QuantumPrecardDraft) {
  if (step === 0) return draft.intro.trim().length >= 10
  if (step === 1) return Boolean(draft.conversationEnergy && draft.planStyle)
  if (step === 2) return draft.interests.length >= 3 && draft.interests.length <= 5
  if (step === 3) return draft.music.trim().length >= 2
  if (step === 4) return Boolean(draft.mintChocolate && draft.naengmyeon)
  return Boolean(draft.meetupRole)
}
