'use client'

import { Check, HeartHandshake, Headphones, MessageCircleMore, Save, Sparkles, UsersRound } from 'lucide-react'

import {
  QUANTUM_DEBATE_QUESTION_DEFINITIONS,
  containsBlockedPersonalContact,
  validateQuantumProfilePreference,
  type QuantumDebateAnswer,
  type QuantumProfilePreferenceDraft,
} from '@/lib/matching/quantum-profile-preferences'

const MBTI_OPTIONS = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'] as const

const INTEREST_OPTIONS = ['보드게임', '러닝', '맛집', '영화', '전시', '카페', '음악', '여행', '산책', '운동', '요리', '사진'] as const

const RELATIONSHIP_BOUNDARIES = [
  { value: '깻잎 대신 눌러주기: 괜찮아요', label: '깻잎 대신 눌러주기 괜찮아요' },
  { value: '깻잎 대신 눌러주기: 불편해요', label: '깻잎 대신 눌러주기 불편해요' },
] as const

export default function QuantumProfilePreferenceWizard({
  draft,
  saving,
  saveError,
  onChange,
  onSave,
}: {
  draft: QuantumProfilePreferenceDraft
  saving: boolean
  saveError: string | null
  onChange: (next: QuantumProfilePreferenceDraft) => void
  onSave: () => void
}) {
  const validation = validateQuantumProfilePreference(draft)
  const missing = getMissingLabels(draft)
  const musicHasBlockedText = draft.favoriteMusic.trim().length > 0
    && containsBlockedPersonalContact(draft.favoriteMusic)
  const sharedDebateCount = draft.debateAnswers.filter((answer) => answer.shareOnCard).length

  function patch(patchValue: Partial<QuantumProfilePreferenceDraft>) {
    onChange({ ...draft, ...patchValue })
  }

  function toggleInterest(interest: string) {
    const selected = draft.interests.includes(interest)
    const interests = selected
      ? draft.interests.filter((item) => item !== interest)
      : draft.interests.length < 5 ? [...draft.interests, interest] : draft.interests
    patch({ interests })
  }

  function setDebateChoice(questionId: string, choice: QuantumDebateAnswer['choice']) {
    const current = draft.debateAnswers.find((answer) => answer.questionId === questionId)
    const nextAnswer: QuantumDebateAnswer = {
      questionId,
      choice,
      shareOnCard: current?.shareOnCard ?? false,
    }
    patch({
      debateAnswers: [
        ...draft.debateAnswers.filter((answer) => answer.questionId !== questionId),
        nextAnswer,
      ],
    })
  }

  function toggleDebateShare(questionId: string) {
    patch({
      debateAnswers: draft.debateAnswers.map((answer) => (
        answer.questionId === questionId
          ? {
              ...answer,
              shareOnCard: answer.shareOnCard ? false : sharedDebateCount < 3,
            }
          : answer
      )),
    })
  }

  return (
    <section aria-labelledby="quantum-preference-title" className="border-y border-[#E8CEC7] bg-[#FFF9F7] py-5 sm:border sm:p-6">
      <header className="border-l-2 border-[#E15E4F] pl-4">
        <p className="text-[11px] font-black text-[#B94B40]">QUANTUM MY</p>
        <h2 id="quantum-preference-title" className="mt-1 text-xl font-black text-[#281D1A]">내 취향 카드</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-[#6F5D58]">다음 만남에도 다시 쓰는 대화 재료예요. 사진, 실명, 연락처는 포함하지 않아요.</p>
      </header>

      <div className="mt-6 space-y-7">
        <PreferenceSection icon={MessageCircleMore} title="대화와 약속" required>
          <ChoiceGrid
            label="대화 에너지"
            value={draft.conversationEnergy ?? ''}
            options={[
              { value: 'listener', label: '잘 들어요' },
              { value: 'balanced', label: '균형형' },
              { value: 'speaker', label: '먼저 말해요' },
            ]}
            onChange={(value) => patch({ conversationEnergy: value as QuantumProfilePreferenceDraft['conversationEnergy'] })}
          />
          <ChoiceGrid
            label="약속 스타일"
            value={draft.planStyle ?? ''}
            options={[
              { value: 'planner', label: '계획형' },
              { value: 'balanced', label: '균형형' },
              { value: 'spontaneous', label: '즉흥형' },
            ]}
            onChange={(value) => patch({ planStyle: value as QuantumProfilePreferenceDraft['planStyle'] })}
          />
        </PreferenceSection>

        <PreferenceSection icon={Sparkles} title="관심사" required>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-[#32231F]">3~5개를 골라 주세요</p>
            <span className="text-xs font-black text-[#B94B40]">{draft.interests.length}/5</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {INTEREST_OPTIONS.map((interest) => {
              const selected = draft.interests.includes(interest)
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleInterest(interest)}
                  className={`min-h-12 rounded-lg border px-2 text-sm font-black transition ${selected ? 'border-[#E15E4F] bg-[#E15E4F] text-white' : 'border-[#E5D3CE] bg-white text-[#5C4944] hover:border-[#D89084]'}`}
                >
                  {selected ? <Check size={14} className="mx-auto mb-1" aria-hidden="true" /> : null}
                  {interest}
                </button>
              )
            })}
          </div>
        </PreferenceSection>

        <PreferenceSection icon={Headphones} title="음악" required>
          <label htmlFor="favorite-music" className="text-sm font-black text-[#32231F]">자주 듣는 음악</label>
          <textarea
            id="favorite-music"
            aria-invalid={musicHasBlockedText}
            aria-describedby={musicHasBlockedText ? 'favorite-music-error' : undefined}
            value={draft.favoriteMusic}
            maxLength={120}
            rows={3}
            onChange={(event) => patch({ favoriteMusic: event.target.value })}
            placeholder="예: 산책할 때 잔잔한 인디 팝과 R&B를 자주 들어요."
            className="mt-3 w-full resize-none rounded-lg border border-[#DFCBC5] bg-white px-4 py-3 text-base font-bold leading-6 text-[#281D1A] outline-none focus:border-[#E15E4F] focus:ring-2 focus:ring-[#E15E4F]/15"
          />
          {musicHasBlockedText ? (
            <p id="favorite-music-error" role="alert" className="mt-2 text-xs font-black leading-5 text-[#9F3D33]">
              연락처, SNS 아이디, 링크, 학과 정보는 음악 소개에 적을 수 없어요.
            </p>
          ) : null}
          <p className="mt-1 text-right text-xs font-bold text-[#8A756E]">{draft.favoriteMusic.length}/120</p>
        </PreferenceSection>

        <PreferenceSection icon={UsersRound} title="가벼운 밸런스" required>
          <p className="text-sm font-bold leading-6 text-[#6F5D58]">정답은 없어요. 선택한 답변 중 공개를 허용한 것만 카드에 최대 세 개 보입니다.</p>
          <div className="mt-4 space-y-5">
            {QUANTUM_DEBATE_QUESTION_DEFINITIONS.map((question) => {
              const answer = draft.debateAnswers.find((item) => item.questionId === question.id)
              return (
                <div key={question.id} className="border-b border-[#EDDCD6] pb-5 last:border-b-0 last:pb-0">
                  <p className="text-sm font-black text-[#32231F]">{question.title}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {([
                      ['A', question.optionA],
                      ['B', question.optionB],
                      ['SKIP', '건너뛰기'],
                    ] as const).map(([choice, label]) => {
                      const selected = answer?.choice === choice
                      return (
                        <button
                          key={choice}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setDebateChoice(question.id, choice)}
                          className={`min-h-11 rounded-lg border px-2 text-sm font-black ${selected ? 'border-[#E15E4F] bg-[#FFF0EB] text-[#A33E34]' : 'border-[#E5D3CE] bg-white text-[#5C4944]'}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {answer ? (
                    <label className="mt-3 flex min-h-10 items-center gap-2 text-xs font-bold text-[#6F5D58]">
                      <input
                        type="checkbox"
                        checked={answer.shareOnCard}
                        disabled={!answer.shareOnCard && sharedDebateCount >= 3}
                        onChange={() => toggleDebateShare(question.id)}
                        className="h-4 w-4 accent-[#E15E4F] disabled:cursor-not-allowed"
                      />
                      이 답변을 같은 방 카드에 공개
                    </label>
                  ) : null}
                </div>
              )
            })}
          </div>
        </PreferenceSection>

        <PreferenceSection icon={HeartHandshake} title="선택 정보">
          <label htmlFor="mbti" className="text-sm font-black text-[#32231F]">MBTI</label>
          <select
            id="mbti"
            value={draft.mbti ?? ''}
            onChange={(event) => patch({ mbti: event.target.value || null })}
            className="mt-3 min-h-12 w-full rounded-lg border border-[#DFCBC5] bg-white px-3 text-sm font-black text-[#32231F] outline-none focus:border-[#E15E4F] focus:ring-2 focus:ring-[#E15E4F]/15"
          >
            <option value="">건너뛰기</option>
            {MBTI_OPTIONS.map((mbti) => <option key={mbti} value={mbti}>{mbti}</option>)}
          </select>
          <p className="mt-5 text-sm font-black text-[#32231F]">연애 경계 질문</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {RELATIONSHIP_BOUNDARIES.map((boundary) => (
              <button
                key={boundary.value}
                type="button"
                aria-pressed={draft.relationshipBoundary === boundary.value}
                onClick={() => patch({ relationshipBoundary: draft.relationshipBoundary === boundary.value ? null : boundary.value })}
                className={`min-h-12 rounded-lg border px-3 text-left text-sm font-black ${draft.relationshipBoundary === boundary.value ? 'border-[#E15E4F] bg-[#FFF0EB] text-[#A33E34]' : 'border-[#E5D3CE] bg-white text-[#5C4944]'}`}
              >
                {boundary.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => patch({ relationshipBoundary: null })} className="mt-2 min-h-10 text-xs font-black text-[#79665F] underline underline-offset-2">연애 경계 질문 건너뛰기</button>
        </PreferenceSection>
      </div>

      {missing.length > 0 ? <p className="mt-6 text-xs font-bold leading-5 text-[#8D5047]">저장하려면 {missing.join(', ')}을(를) 채워 주세요.</p> : null}
      {saveError ? <p role="alert" className="mt-4 border-l-2 border-[#C7493E] bg-[#FFF1ED] px-4 py-3 text-sm font-black leading-6 text-[#9F3D33]">{saveError}</p> : null}
      <button
        type="button"
        disabled={!validation.ok || saving}
        onClick={onSave}
        className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#2E2928] px-5 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-[#D9C9C4]"
      >
        <Save size={18} aria-hidden="true" />
        {saving ? '내 취향 저장 중' : '내 취향 저장'}
      </button>
    </section>
  )
}

function PreferenceSection({
  icon: Icon,
  title,
  required = false,
  children,
}: {
  icon: typeof MessageCircleMore
  title: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon size={17} className="text-[#D75B4D]" aria-hidden="true" />
        <h3 className="text-base font-black text-[#281D1A]">{title}</h3>
        {required ? <span className="text-[10px] font-black text-[#B94B40]">필수</span> : <span className="text-[10px] font-black text-[#8A756E]">선택</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ChoiceGrid({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="mt-5 first:mt-0">
      <legend className="text-sm font-black text-[#32231F]">{label}</legend>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(option.value)} className={`min-h-12 rounded-lg border px-2 text-sm font-black ${selected ? 'border-[#E15E4F] bg-[#FFF0EB] text-[#A33E34]' : 'border-[#E5D3CE] bg-white text-[#5C4944]'}`}>
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function getMissingLabels(draft: QuantumProfilePreferenceDraft) {
  const missing: string[] = []
  if (!draft.conversationEnergy) missing.push('대화 에너지')
  if (!draft.planStyle) missing.push('약속 스타일')
  if (draft.interests.length < 3) missing.push('관심사 3개')
  if (!draft.favoriteMusic.trim()) missing.push('음악')
  if (QUANTUM_DEBATE_QUESTION_DEFINITIONS.some((question) => (
    question.required && !draft.debateAnswers.some((answer) => answer.questionId === question.id)
  ))) missing.push('필수 밸런스 답변')
  return missing
}
