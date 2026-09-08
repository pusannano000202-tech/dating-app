'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useId, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, CircleAlert, MessageCircle, PenLine, Send, ThumbsDown, ThumbsUp, UsersRound, X } from 'lucide-react'

import { getCommunityComposer, communityCategoryCatalog } from '@/lib/community/catalog'
import {
  COMMUNITY_POST_BODY_MAX,
  COMMUNITY_POST_BODY_MIN,
  COMMUNITY_POST_TITLE_MAX,
  COMMUNITY_POST_TITLE_MIN,
  type CommunityCategory,
  type MeetupCategory,
} from '@/lib/community/contracts'

export type CommunityPost = {
  id: string
  category: CommunityCategory
  title: string
  body: string
  like_count?: number
  comment_count?: number
  author_alias?: string
  is_author?: boolean
  liked_by_me?: boolean
  dislike_count?: number
  disliked_by_me?: boolean
  created_at?: string
}

export type ReviewableMeetup = {
  id: string
  title: string
  category: MeetupCategory
  place_name: string
  scheduled_at: string
}

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'schema_unavailable' | 'error'
type ReviewableLoadState = 'loading' | 'ready' | 'empty' | 'unauthorized' | 'schema_unavailable' | 'error'

type CommunityBoardProps = {
  board: {
    id: CommunityCategory
    title: string
    description: string
    href: string
    actionLabel: string
  }
  previewReviewableMeetups?: ReviewableMeetup[]
}

export default function CommunityBoard({
  board,
  previewReviewableMeetups,
}: CommunityBoardProps) {
  const composer = getCommunityComposer(board.id)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reviewableState, setReviewableState] = useState<ReviewableLoadState>('loading')
  const [reviewableMeetups, setReviewableMeetups] = useState<ReviewableMeetup[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedMeetupId, setSelectedMeetupId] = useState('')
  const [isReviewablePickerOpen, setIsReviewablePickerOpen] = useState(false)
  const [busyPost, setBusyPost] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const listboxId = useId()

  useEffect(() => {
    let active = true
    setLoadState('loading')

    fetch(`/api/community/posts?category=${board.id}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          posts?: CommunityPost[]
          availability?: 'ready' | 'auth_required' | 'schema_unavailable'
          error?: string
        }

        if (!active) return
        if (response.ok) {
          if (payload.availability === 'auth_required') {
            setPosts([])
            setLoadState('unauthorized')
            return
          }
          if (payload.availability === 'schema_unavailable') {
            setPosts([])
            setLoadState('schema_unavailable')
            return
          }
          setPosts(payload.posts ?? [])
          setLoadState('ready')
          return
        }

        if (response.status === 401) setLoadState('unauthorized')
        else setLoadState('error')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })

    return () => {
      active = false
    }
  }, [board.id])

  useEffect(() => {
    if (board.id !== 'meetup-review') return

    if (previewReviewableMeetups) {
      setReviewableMeetups(previewReviewableMeetups)
      setReviewableState(previewReviewableMeetups.length > 0 ? 'ready' : 'empty')
      return
    }

    let active = true
    setReviewableState('loading')

    fetch('/api/community/reviewable-meetups', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          meetups?: ReviewableMeetup[]
          availability?: 'ready' | 'auth_required' | 'schema_unavailable'
          error?: string
        }

        if (!active) return
        if (response.ok) {
          if (payload.availability === 'auth_required') {
            setReviewableMeetups([])
            setReviewableState('unauthorized')
            return
          }
          if (payload.availability === 'schema_unavailable') {
            setReviewableMeetups([])
            setReviewableState('schema_unavailable')
            return
          }

          const meetups = payload.meetups ?? []
          setReviewableMeetups(meetups)
          setReviewableState(meetups.length > 0 ? 'ready' : 'empty')
          return
        }
        setReviewableState(response.status === 401 ? 'unauthorized' : 'error')
      })
      .catch(() => {
        if (active) setReviewableState('error')
      })

    return () => {
      active = false
    }
  }, [board.id, previewReviewableMeetups])

  const selectedReviewableMeetup = useMemo(
    () => reviewableMeetups.find((meetup) => meetup.id === selectedMeetupId),
    [reviewableMeetups, selectedMeetupId],
  )
  const normalizedTitleLength = title.trim().length
  const normalizedBodyLength = body.trim().length
  const isPostDraftValid = normalizedTitleLength >= COMMUNITY_POST_TITLE_MIN
    && normalizedTitleLength <= COMMUNITY_POST_TITLE_MAX
    && normalizedBodyLength >= COMMUNITY_POST_BODY_MIN
    && normalizedBodyLength <= COMMUNITY_POST_BODY_MAX
    && (board.id !== 'meetup-review' || Boolean(selectedMeetupId))

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedTitle = title.trim()
    const normalizedBody = body.trim()
    const hasMeetupReview = board.id === 'meetup-review'

    if (normalizedTitle.length < COMMUNITY_POST_TITLE_MIN) {
      setNotice(`제목은 ${COMMUNITY_POST_TITLE_MIN}자 이상 작성해 주세요.`)
      return
    }
    if (normalizedBody.length < COMMUNITY_POST_BODY_MIN) {
      setNotice(`내용은 ${COMMUNITY_POST_BODY_MIN}자 이상 작성해 주세요.`)
      return
    }
    if (hasMeetupReview && !selectedMeetupId) {
      setNotice('후기 대상 모임을 먼저 선택해 주세요.')
      return
    }

    setBusyPost(true)
    setNotice('')

    const payload = {
      category: board.id,
      title: normalizedTitle,
      body: normalizedBody,
      ...(hasMeetupReview ? { meetup_id: selectedMeetupId } : {}),
    } satisfies Record<string, unknown>

    const response = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null)

    if (!response) {
      setNotice('요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setBusyPost(false)
      return
    }

    const responsePayload = await response.json().catch(() => ({})) as {
      error?: string
      post?: CommunityPost
    }
    if (!response.ok) {
      setNotice(mapCommunityError(responsePayload.error))
      setBusyPost(false)
      return
    }

    if (responsePayload.post) {
      const createdPost = responsePayload.post
      setPosts((current) => [createdPost, ...current])
    }

    setTitle('')
    setBody('')
    setSelectedMeetupId('')
    setNotice('작성 완료했습니다.')
    setShowComposer(false)
    setBusyPost(false)
  }

  const reviewablePickerLabel = selectedReviewableMeetup
    ? `${selectedReviewableMeetup.title} · ${formatDate(selectedReviewableMeetup.scheduled_at)}`
    : '후기할 모임을 먼저 선택해 주세요'

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-6">
        <header className="flex items-start gap-3 border-b border-boot-hairline pb-4">
          <Link
            href="/community"
            aria-label="커뮤니티 메인으로 이동"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-boot-hairline bg-white text-boot-muted"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="text-xs font-black text-boot-primary">COMMUNITY</p>
            <h1 className="mt-1 text-2xl font-black">{board.title}</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">{board.description}</p>
          </div>
        </header>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 py-4 sm:-mx-6 sm:px-6" aria-label="커뮤니티 메뉴 이동">
          <Link href="/community/hot" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] bg-boot-ink px-3 text-xs font-black text-white">
            <UsersRound size={15} /> 핫피드
          </Link>
          {communityCategoryCatalog.map((entry) => (
            <Link
              key={entry.id}
              href={entry.href}
              className={`flex min-h-11 shrink-0 items-center rounded-[8px] border border-boot-hairline px-3 text-xs font-black ${
                board.id === entry.id ? 'bg-boot-primary text-white' : 'bg-white text-boot-muted'
              }`}
              aria-current={board.id === entry.id ? 'page' : undefined}
            >
              {entry.title}
            </Link>
          ))}
        </nav>

        <section className="flex items-center justify-between gap-3 border-y border-boot-hairline bg-white px-4 py-3">
          <div>
            <p className="text-[11px] font-black text-boot-primary">게시글 먼저 보기</p>
            <h2 className="mt-1 text-base font-black">{board.title} 최신 글</h2>
          </div>
          <button
            type="button"
            aria-expanded={showComposer}
            aria-controls="community-composer"
            onClick={() => setShowComposer((open) => !open)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-[8px] bg-boot-primary px-4 text-sm font-black text-white"
          >
            {showComposer ? <X size={16} /> : <PenLine size={16} />}
            {showComposer ? '닫기' : '글쓰기 열기'}
          </button>
        </section>

        {showComposer ? (
        <div id="community-composer" className="mt-4 border-b border-boot-hairline pb-4">
        <section className="rounded-[8px] border border-boot-hairline bg-white p-4">
          <p className="text-xs font-black text-boot-primary">{composer.intro}</p>
          <p className="mt-1 text-xs font-bold text-boot-muted">질문에 답하면 글의 흐름을 빠르게 잡을 수 있어요.</p>
          <ul className="mt-2 grid gap-1 text-xs font-bold leading-5 text-boot-muted">
            {composer.guidedPrompts.map((prompt) => (
              <li key={prompt} className="flex items-start gap-2">
                <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-boot-primary" aria-hidden="true" />
                <span>{prompt}</span>
              </li>
            ))}
          </ul>
        </section>

        {board.id === 'meetup-review' ? (
          <section className="mt-4 rounded-[8px] border border-boot-hairline bg-white p-4">
            <h2 className="text-sm font-black">참여한 모임에서 후기 대상 선택</h2>
            <p className="mt-1 text-xs font-bold text-boot-muted">
              후기 작성은 실제 참여 검증이 완료된 모임만 가능합니다.
            </p>

            {reviewableState === 'loading' ? (
              <p className="mt-3 text-xs font-bold text-boot-muted">참여 가능한 후기 대상을 불러오는 중이에요.</p>
            ) : null}
            {reviewableState === 'schema_unavailable' ? (
              <Notice text="모임 후기 대상을 아직 읽을 수 없어요. 스키마가 준비될 때까지 잠시만 기다려 주세요." />
            ) : null}
            {reviewableState === 'unauthorized' ? (
              <Notice text="로그인 상태에서만 후기 대상을 확인할 수 있어요." />
            ) : null}
            {reviewableState === 'error' ? (
              <Notice text="후기 대상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
            ) : null}
            {reviewableState === 'empty' ? (
              <Notice text="현재 선택 가능한 후기 대상이 없습니다. 모임 완료 후 다시 확인해 주세요." />
            ) : null}

            <button
              type="button"
              role="combobox"
              aria-expanded={isReviewablePickerOpen}
              aria-controls={listboxId}
              aria-labelledby="reviewable-meetup-picker-label"
              onClick={() => setIsReviewablePickerOpen((open) => !open)}
              className="mt-3 flex w-full min-h-11 items-center justify-between gap-2 rounded-[8px] border border-boot-hairline bg-white px-3 text-left"
            >
              <span>
                <span id="reviewable-meetup-picker-label" className="block text-[11px] font-black text-boot-muted">
                  모임 선택
                </span>
                <span className="mt-1 block text-sm font-black">{reviewablePickerLabel}</span>
              </span>
              <ChevronDown size={18} />
            </button>

            {isReviewablePickerOpen ? (
              <div role="listbox" id={listboxId} className="mt-2 max-h-56 overflow-auto rounded-[8px] border border-boot-hairline bg-white">
                {reviewableMeetups.map((meetup) => (
                  <button
                    key={meetup.id}
                    type="button"
                    role="option"
                    aria-selected={selectedMeetupId === meetup.id}
                    onClick={() => {
                      setSelectedMeetupId(meetup.id)
                      setIsReviewablePickerOpen(false)
                    }}
                    className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-xs font-black text-boot-ink"
                  >
                    <span>{meetup.title}</span>
                    <span className="mt-1 text-[11px] font-bold text-boot-muted">
                      {formatDate(meetup.scheduled_at)} · {meetup.place_name}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-4 rounded-[8px] border border-boot-hairline bg-white p-4">
          <h2 className="text-sm font-black">새 글 작성</h2>
          <div aria-live="polite">
            {notice ? <p className="mt-2 rounded-[8px] bg-boot-soft px-3 py-2 text-xs font-black text-boot-primary" role="status">{notice}</p> : null}
          </div>
          <form className="mt-3 space-y-3" onSubmit={submitPost} noValidate>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="제목"
              minLength={COMMUNITY_POST_TITLE_MIN}
              maxLength={COMMUNITY_POST_TITLE_MAX}
              aria-describedby="community-title-count"
              className="h-11 w-full rounded-[8px] border border-boot-hairline bg-white px-3 text-sm font-black outline-none focus-visible:border-boot-primary"
            />
            <p id="community-title-count" className="text-right text-[11px] font-bold text-boot-muted">
              제목 {normalizedTitleLength}/{COMMUNITY_POST_TITLE_MAX} · 최소 {COMMUNITY_POST_TITLE_MIN}자
            </p>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="내용을 적어 주세요."
              rows={8}
              minLength={COMMUNITY_POST_BODY_MIN}
              maxLength={COMMUNITY_POST_BODY_MAX}
              aria-describedby="community-body-count"
              className="w-full rounded-[8px] border border-boot-hairline bg-white px-3 py-2 text-sm font-black outline-none focus-visible:border-boot-primary"
            />
            <p id="community-body-count" className="text-right text-[11px] font-bold text-boot-muted">
              내용 {normalizedBodyLength}/{COMMUNITY_POST_BODY_MAX} · 최소 {COMMUNITY_POST_BODY_MIN}자
            </p>
            {!isPostDraftValid ? (
              <p className="rounded-[8px] bg-[#EEF4F2] px-3 py-2 text-xs font-bold leading-5 text-[#55716C]">
                {board.id === 'meetup-review' && !selectedMeetupId
                  ? '후기할 모임을 고른 뒤 제목 4자와 내용 10자를 채우면 올릴 수 있어요.'
                  : '제목 4자와 내용 10자를 채우면 올릴 수 있어요.'}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busyPost}
              data-draft-ready={isPostDraftValid}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[8px] px-4 text-sm font-black text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isPostDraftValid ? 'bg-boot-primary' : 'bg-[#6D8581]'}`}
            >
              <Send size={14} />
              {busyPost ? '작성중...' : '글 올리기'}
            </button>
          </form>
        </section>
        </div>
        ) : null}

        <section className="mt-3 pb-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="sr-only">최근 글</h2>
            <p className="text-xs font-bold text-boot-muted">실시간 API 결과</p>
          </div>
          {loadState === 'loading' ? (
            <StatusBox text="게시글을 불러오는 중입니다." />
          ) : null}
          {loadState === 'unauthorized' ? (
            <StatusBox text="로그인 후 글 목록을 볼 수 있어요." />
          ) : null}
          {loadState === 'schema_unavailable' ? (
            <StatusBox text="현재 게시글 스키마가 준비되지 않아 목록을 보여주지 않아요." />
          ) : null}
          {loadState === 'error' ? (
            <StatusBox text="게시글을 가져오지 못했어요. 잠시 후 다시 시도해 주세요." />
          ) : null}

          {loadState === 'ready' && posts.length === 0 ? (
            <p className="mt-3 rounded-[8px] border border-boot-hairline bg-white px-3 py-4 text-xs font-black text-boot-muted">
              아직 글이 없습니다. 첫 번째 글을 남겨주세요.
            </p>
          ) : null}

          {loadState === 'ready' && posts.length ? (
            <div className="mt-3 divide-y divide-boot-hairline rounded-[8px] border border-boot-hairline bg-white">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/community/${board.id}/${post.id}`}
                  className="block p-4 transition-colors hover:bg-boot-soft focus-visible:bg-boot-soft focus-visible:outline-none"
                >
                  <h3 className="break-words text-base font-black">{post.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm font-bold leading-6 text-boot-muted">{post.body}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black">
                    <span className="text-boot-primary">{post.author_alias ?? '익명'} · {formatCompactDate(post.created_at)}</span>
                    <span className="flex items-center gap-3 text-boot-muted">
                      <span className="flex items-center gap-1" aria-label={`좋아요 ${post.like_count ?? 0}개`}><ThumbsUp size={14} /> {post.like_count ?? 0}</span>
                      <span className="flex items-center gap-1" aria-label={`싫어요 ${post.dislike_count ?? 0}개`}><ThumbsDown size={14} /> {post.dislike_count ?? 0}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={14} /> {post.comment_count ?? 0}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function StatusBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex min-h-20 items-center gap-3 rounded-[8px] border border-boot-hairline bg-white px-4 py-3">
      <CircleAlert size={18} className="shrink-0 text-boot-coral" />
      <p className="text-sm font-bold leading-6 text-boot-muted">{text}</p>
    </div>
  )
}

function Notice({ text }: { text: string }) {
  return <p className="mt-3 rounded-[8px] border border-boot-hairline bg-boot-soft px-3 py-2 text-xs font-black text-boot-muted">{text}</p>
}

function mapCommunityError(error?: string): string {
  if (error === 'invalid_title') return '제목 형식이 잘못됐어요. 4자 이상으로 다시 써 주세요.'
  if (error === 'invalid_body') return '내용은 10자 이상 작성해 주세요.'
  if (error === 'invalid_category') return '현재 게시판으로 글을 보낼 수 없는 카테고리예요.'
  if (error === 'invalid_meetup') return '후기할 만남을 선택해 주세요.'
  if (error === 'profile_required') return '프로필 정보가 필요한 기능입니다. 프로필을 다시 확인해 주세요.'
  if (error === 'rate_limited') return '짧은 시간에 너무 많이 요청했어요. 잠시 후 다시 시도해 주세요.'
  if (error === 'auth_required' || error === 'Unauthorized') return '로그인이 필요해요.'
  return '요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function formatCompactDate(value?: string): string {
  if (!value) return '방금'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
