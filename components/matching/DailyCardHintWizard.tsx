'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Film, MapPin, Music2, Save, Sparkles } from 'lucide-react'
import DebateChoiceCard from '@/components/matching/DebateChoiceCard'
import {
  countCompletedDailyCardDebateAnswers,
  countCompletedDailyCardSongs,
  DAILY_CARD_FIELDS,
  DEBATE_CARD_PROMPTS,
  decodeDailyCardDebateAnswers,
  decodeDailyCardSongs,
  encodeDailyCardSongs,
  REQUIRED_SONG_COUNT,
  type DailyCardDraft,
  type DailyCardFieldId,
} from '@/lib/matching/daily-card-authoring'

interface DailyCardHintWizardProps {
  draft: DailyCardDraft
  completedCount: number
  minimumToSave: number
  totalCount: number
  submittedAt: string | null
  canSave: boolean
  tooLong: boolean
  saving: boolean
  onTextChange: (fieldId: DailyCardFieldId, value: string) => void
  onDebateAnswer: (promptId: string, value: string) => void
  onSave: () => void
  formatSubmittedAt: (iso: string) => string
}

const debateImageMap: Record<string, [string, string]> = {
  tangsuyuk: ['/daily-cards/debate/tangsuyuk-dip.png', '/daily-cards/debate/tangsuyuk-pour.png'],
  mintChocolate: ['/daily-cards/debate/mint-choco-yes.png', '/daily-cards/debate/mint-choco-no.png'],
  noodles: ['/daily-cards/debate/jajang.png', '/daily-cards/debate/jjamppong.png'],
  naengmyeon: ['/daily-cards/debate/naengmyeon-mul.png', '/daily-cards/debate/naengmyeon-bibim.png'],
}

const stepLabels: Record<DailyCardFieldId, string> = {
  songs: '노래',
  food: '음식점',
  weekend: '시간',
  conversation: '대화',
  question: '영화',
  debate: '논쟁',
}

const PNU_RESTAURANT_SUGGESTIONS = [
  {
    name: '톤쇼우',
    hint: '돈카츠',
    mood: '든든한 첫 만남',
  },
  {
    name: '겐쇼심야라멘',
    hint: '라멘',
    mood: '편한 저녁 약속',
  },
  {
    name: '모모스커피',
    hint: '카페',
    mood: '가볍게 대화 시작',
  },
]

export default function DailyCardHintWizard({
  draft,
  completedCount,
  minimumToSave,
  totalCount,
  submittedAt,
  canSave,
  tooLong,
  saving,
  onTextChange,
  onDebateAnswer,
  onSave,
  formatSubmittedAt,
}: DailyCardHintWizardProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeDebateIndex, setActiveDebateIndex] = useState(0)
  const field = DAILY_CARD_FIELDS[activeIndex] ?? DAILY_CARD_FIELDS[0]
  const value = draft[field.id]
  const isDebate = field.input === 'multi_choice'
  const isFood = field.id === 'food'
  const isSongs = field.id === 'songs'
  const isMovie = field.id === 'question'
  const prompts = field.debatePrompts ?? []
  const activePrompt = prompts[activeDebateIndex] ?? prompts[0]
  const debateAnswers = useMemo(() => decodeDailyCardDebateAnswers(value), [value])
  const songValues = useMemo(() => decodeDailyCardSongs(draft.songs), [draft.songs])
  const debateAnswerCount = isDebate ? countCompletedDailyCardDebateAnswers(value) : 0
  const debatePromptCount = prompts.length
  const completedSongCount = isSongs ? countCompletedDailyCardSongs(value) : 0
  const currentFilled = isDebate
    ? debatePromptCount > 0 && debateAnswerCount >= debatePromptCount
    : isFood
      ? value.trim().length > 0
    : isSongs
      ? completedSongCount >= REQUIRED_SONG_COUNT
    : value.trim().length > 0

  const progressPercent = Math.round((completedCount / Math.max(totalCount, 1)) * 100)
  const canGoPrev = activeIndex > 0
  const canGoNext = activeIndex < DAILY_CARD_FIELDS.length - 1
  const canGoPrevDebate = isDebate && activeDebateIndex > 0
  const canGoNextDebate = isDebate && activeDebateIndex < prompts.length - 1

  function isFieldComplete(fieldId: DailyCardFieldId): boolean {
    if (fieldId === 'debate') {
      return countCompletedDailyCardDebateAnswers(draft.debate) >= DEBATE_CARD_PROMPTS.length
    }
    if (fieldId === 'food') {
      return draft.food.trim().length > 0
    }
    if (fieldId === 'songs') {
      return countCompletedDailyCardSongs(draft.songs) >= REQUIRED_SONG_COUNT || (
        draft.songs.trim().length > 0 && !draft.songs.includes('[song:')
      )
    }
    return draft[fieldId].trim().length > 0
  }

  function updateSong(index: number, nextValue: string) {
    const nextSongs = [...songValues]
    nextSongs[index] = nextValue
    onTextChange('songs', encodeDailyCardSongs(nextSongs))
  }

  function goToNextIncomplete() {
    const nextIndex = DAILY_CARD_FIELDS.findIndex((item) => !isFieldComplete(item.id))
    if (nextIndex < 0) return
    setActiveIndex(nextIndex)
    setActiveDebateIndex(0)
  }

  function handleDebateChoiceSelect(value: string) {
    if (!activePrompt) return
    onDebateAnswer(activePrompt.id, value)
    if (canGoNextDebate) {
      setActiveDebateIndex((index) => Math.min(prompts.length - 1, index + 1))
    }
  }

  function buildRestaurantMapUrl(restaurant: string): string {
    return `https://map.naver.com/p/search/${encodeURIComponent(`부산대 ${restaurant.trim()}`)}`
  }

  const nextIncompleteIndex = DAILY_CARD_FIELDS.findIndex((item) => !isFieldComplete(item.id))
  const nextIncompleteField = nextIncompleteIndex >= 0 ? DAILY_CARD_FIELDS[nextIncompleteIndex] : null

  return (
    <div className="overflow-hidden rounded-[30px] border border-boot-hairline bg-white/95 shadow-sm">
      <div className="relative border-b border-boot-hairline bg-[radial-gradient(circle_at_20%_20%,rgba(255,90,111,0.16),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(20,184,166,0.14),transparent_30%),linear-gradient(135deg,#fff,#fff8f9)] p-4">
        <div className="absolute right-4 top-4 flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-boot-primary/50" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
          <span className="h-2 w-2 rounded-full bg-amber-300/70" />
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-normal text-boot-primary">사전 힌트 작성</p>
          <h3 className="mt-1 pr-14 text-xl font-black leading-tight text-boot-ink">{field.title}</h3>
          <p className="mt-1 text-xs leading-5 text-boot-muted">{field.helper}</p>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-4 rounded-2xl border border-boot-primary/15 bg-boot-soft px-3 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-white text-boot-primary">
              {currentFilled ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
            </span>
            <div>
              <p className="text-[11px] font-black text-boot-primary">어떻게 공개돼요?</p>
              <p className="mt-1 text-xs leading-5 text-boot-body">
                지금 쓰는 것은 <b>사전 힌트 재료</b>예요. 매칭이 확정되면 상대 그룹이 16:00-20:00에
                <b> 오늘의 카드</b>를 직접 뽑아서 하루 한 장씩 보게 됩니다.
              </p>
            </div>
          </div>
        </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-boot-muted">
          <span>{activeIndex + 1}/{totalCount}</span>
          <span>{completedCount}/{totalCount} 완료</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-boot-soft">
          <div
            className="h-full rounded-full bg-boot-primary transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-boot-hairline bg-white/80 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-boot-primary">
              {nextIncompleteField ? '다음 작성할 카드' : '모든 카드 작성 완료'}
            </p>
            <p className="mt-0.5 truncate text-xs font-bold text-boot-ink">
              {nextIncompleteField ? nextIncompleteField.title : '이제 저장하고 보증금 결제로 넘어가면 돼요'}
            </p>
          </div>
          {nextIncompleteField && nextIncompleteIndex !== activeIndex && (
            <button
              type="button"
              onClick={goToNextIncomplete}
              className="flex-shrink-0 rounded-xl border border-boot-primary/20 bg-boot-soft px-3 py-2 text-[11px] font-black text-boot-primary"
            >
              바로가기
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {DAILY_CARD_FIELDS.map((item, index) => {
          const selected = index === activeIndex
          const done = isFieldComplete(item.id)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveIndex(index)
                setActiveDebateIndex(0)
              }}
              className={`flex h-12 flex-col items-center justify-center rounded-2xl border text-[10px] font-black transition ${
                selected
                  ? 'border-boot-primary bg-boot-primary text-white'
                  : done
                    ? 'border-emerald-400/30 bg-emerald-50 text-emerald-700'
                    : 'border-boot-hairline bg-white text-boot-muted'
              }`}
              aria-label={`${item.title} 항목으로 이동`}
            >
              <span>{stepLabels[item.id]}</span>
              <span className="mt-0.5 text-[9px] opacity-75">{done ? '완료' : `${index + 1}`}</span>
            </button>
          )
        })}
      </div>

      {isDebate && activePrompt ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-boot-primary/15 bg-boot-soft px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-boot-primary">
                논쟁 {activeDebateIndex + 1}/{prompts.length}
              </p>
              <span className="text-[10px] font-bold text-boot-muted">
                {debateAnswerCount}/{debatePromptCount} 선택
              </span>
            </div>
            <p className="mt-1 text-sm font-black text-boot-ink">{activePrompt.question}</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {activePrompt.choices.map((choice, choiceIndex) => (
              <DebateChoiceCard
                key={choice.value}
                label={choice.label}
                title={choice.title}
                description={choice.description}
                imageSrc={debateImageMap[activePrompt.id]?.[choiceIndex] ?? '/daily-cards/debate/tangsuyuk-dip.png'}
                selected={debateAnswers[activePrompt.id] === choice.value}
                onSelect={() => handleDebateChoiceSelect(choice.value)}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveDebateIndex((index) => Math.max(0, index - 1))}
              disabled={!canGoPrevDebate}
              className="rounded-2xl border border-boot-hairline bg-white px-3 py-3 text-xs font-bold text-boot-body disabled:opacity-35"
            >
              이전 논쟁
            </button>
            <button
              type="button"
              onClick={() => setActiveDebateIndex((index) => Math.min(prompts.length - 1, index + 1))}
              disabled={!canGoNextDebate}
              className="rounded-2xl border border-boot-primary/20 bg-boot-soft px-3 py-3 text-xs font-bold text-boot-primary disabled:opacity-35"
            >
              다음 논쟁
            </button>
          </div>
        </div>
      ) : isSongs ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-boot-primary/15 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-boot-primary">노래 3곡 입력</p>
              <span className="text-[10px] font-bold text-boot-muted">
                {completedSongCount}/{REQUIRED_SONG_COUNT} 입력
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              제목만 적어도 되고, 가수까지 적으면 상대가 더 쉽게 말을 걸 수 있어요.
            </p>
          </div>

          <div className="space-y-2">
            {Array.from({ length: REQUIRED_SONG_COUNT }).map((_, index) => (
              <label
                key={index}
                className="flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white px-3 py-3 focus-within:border-boot-primary"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-boot-soft text-boot-primary">
                  <Music2 size={15} />
                </span>
                <input
                  type="text"
                  value={songValues[index] ?? ''}
                  onChange={(event) => updateSong(index, event.target.value)}
                  placeholder={index === 0 ? '예: Ditto - NewJeans' : index === 1 ? '예: 주저하는 연인들을 위해 - 잔나비' : '예: I Like Me Better - Lauv'}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-boot-ink outline-none placeholder:text-boot-muted/70"
                />
              </label>
            ))}
          </div>
        </div>
      ) : isFood ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-boot-primary/15 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-boot-primary">진짜 좋아하는 음식점 1곳</p>
              <span className="text-[10px] font-bold text-boot-muted">
                {value.trim() ? '입력됨' : '미입력'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              “한식/디저트” 같은 범주보다, 내 취향을 보여주는 가게 이름 하나가 훨씬 말 걸기 좋아요.
            </p>
          </div>

          <label className="block rounded-3xl border border-boot-hairline bg-white p-4 focus-within:border-boot-primary">
            <span className="text-[11px] font-black text-boot-primary">음식점 이름</span>
            <input
              type="text"
              value={value}
              onChange={(event) => onTextChange('food', event.target.value)}
              placeholder="예: 톤쇼우, 겐쇼심야라멘, 모모스커피"
              className="mt-2 w-full bg-transparent text-base font-black text-boot-ink outline-none placeholder:text-boot-muted/70"
            />
          </label>

          <div className="rounded-2xl border border-boot-primary/15 bg-boot-soft px-3 py-3">
            <p className="text-[11px] font-black text-boot-primary">부산대 근처 예시 3곳</p>
            <p className="mt-0.5 text-[11px] leading-4 text-boot-muted">
              직접 입력해도 되고, 아래에서 하나 골라도 돼요. 상대가 카드를 열면 지도 검색으로 이어집니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PNU_RESTAURANT_SUGGESTIONS.map((restaurant) => {
              const selected = value.trim() === restaurant.name
              return (
                <button
                  key={restaurant.name}
                  type="button"
                  onClick={() => onTextChange('food', restaurant.name)}
                  className={[
                    'rounded-2xl border px-2 py-3 text-left transition',
                    selected
                      ? 'border-boot-primary bg-boot-soft text-boot-primary'
                      : 'border-boot-hairline bg-white text-boot-body hover:border-boot-primary/30',
                  ].join(' ')}
                >
                  <span className="block text-xs font-black">{restaurant.name}</span>
                  <span className="mt-0.5 block text-[10px] text-boot-muted">{restaurant.hint}</span>
                  <span className="mt-2 block rounded-full bg-white/75 px-2 py-1 text-center text-[9px] font-bold text-boot-muted">
                    {restaurant.mood}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-boot-hairline bg-white/75 px-3 py-3 text-[11px] leading-5 text-boot-muted">
            <MapPin size={13} className="mt-0.5 flex-shrink-0 text-boot-primary" />
            {value.trim() ? (
              <p>
                상대가 카드를 열면 이 음식점을 눌러 위치를 확인할 수 있어요.{' '}
                <a
                  href={buildRestaurantMapUrl(value)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-black text-boot-primary underline underline-offset-2"
                >
                  네이버지도에서 미리 보기
                  <ExternalLink size={11} />
                </a>
              </p>
            ) : (
              <p>음식점 이름을 입력하면 네이버지도 검색 링크가 자동으로 생겨요.</p>
            )}
          </div>
        </div>
      ) : isMovie ? (
        <div className="space-y-3">
          <label className="block rounded-3xl border border-boot-hairline bg-white p-4 focus-within:border-boot-primary">
            <span className="flex items-center gap-1.5 text-[11px] font-black text-boot-primary">
              <Film size={13} />
              영화 1개
            </span>
            <input
              type="text"
              value={value}
              onChange={(event) => onTextChange('question', event.target.value)}
              maxLength={70}
              placeholder={field.placeholder}
              className="mt-2 w-full bg-transparent text-sm font-bold text-boot-ink outline-none placeholder:text-boot-muted/70"
            />
          </label>
          <p className="rounded-2xl border border-boot-hairline bg-white/75 px-3 py-3 text-[11px] leading-5 text-boot-muted">
            영화 하나만 골라도 취향이 선명해져요. 감상평은 한 문장만 붙이면 충분합니다.
          </p>
        </div>
      ) : (
        <>
          <textarea
            value={value}
            onChange={(event) => onTextChange(field.id, event.target.value)}
            maxLength={70}
            rows={4}
            className="min-h-[148px] w-full resize-none rounded-3xl border border-boot-hairline bg-white px-4 py-3 text-sm leading-6 text-boot-ink outline-none transition focus:border-boot-primary"
            placeholder={field.placeholder}
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-boot-muted">
            <span>짧고 구체적일수록 상대가 읽기 좋아요.</span>
            <span>{value.trim().length}/70</span>
          </div>
        </>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
          disabled={!canGoPrev}
          className="flex h-12 items-center justify-center gap-1 rounded-2xl border border-boot-hairline bg-white text-sm font-bold text-boot-body disabled:opacity-35"
        >
          <ChevronLeft size={15} />
          이전
        </button>
        <button
          type="button"
          onClick={() => setActiveIndex((index) => Math.min(DAILY_CARD_FIELDS.length - 1, index + 1))}
          disabled={!canGoNext}
          className="flex h-12 items-center justify-center gap-1 rounded-2xl border border-boot-primary/20 bg-boot-soft text-sm font-bold text-boot-primary disabled:opacity-35"
        >
          다음
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-boot-hairline bg-white/75 px-3 py-3">
        <p className={`text-[11px] leading-relaxed ${canSave ? 'text-emerald-700' : 'text-boot-muted'}`}>
          {completedCount}/{totalCount} 완료 · 저장 가능 기준 {minimumToSave}개
          {tooLong ? ' · 길이를 조금 줄여주세요' : ''}
          {submittedAt ? ` · 저장됨 ${formatSubmittedAt(submittedAt)}` : ''}
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-boot-ink text-sm font-black text-white disabled:opacity-40"
        >
          <Save size={15} />
          {saving ? '저장 중' : '사전 힌트 저장'}
        </button>
      </div>
      </div>
    </div>
  )
}
