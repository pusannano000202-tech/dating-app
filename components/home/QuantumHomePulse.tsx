'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, CircleAlert, Flame, Heart, MapPin, UsersRound } from 'lucide-react'

type MeetupRecord = {
  id: string
  title: string
  place_name: string
  scheduled_at: string
  capacity: number
  member_count: number
  status: 'open' | 'full'
}

type CommunityPost = {
  id: string
  title: string
  body: string
  like_count?: number
}

type LoadState = 'loading' | 'ready' | 'auth_required' | 'schema_unavailable' | 'error'

type MeetupResponse = {
  meetups?: MeetupRecord[]
  availability?: Exclude<LoadState, 'loading' | 'error'>
}

type HotPostResponse = {
  posts?: CommunityPost[]
  availability?: Exclude<LoadState, 'loading' | 'error'>
}

export default function QuantumHomePulse() {
  const [meetups, setMeetups] = useState<MeetupRecord[]>([])
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [meetupState, setMeetupState] = useState<LoadState>('loading')
  const [postState, setPostState] = useState<LoadState>('loading')

  useEffect(() => {
    let active = true

    void fetch('/api/meetups?limit=3', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as MeetupResponse
        if (!active) return
        if (!response.ok) {
          setMeetupState(response.status === 401 ? 'auth_required' : 'error')
          return
        }
        setMeetups((payload.meetups ?? []).filter((meetup) => meetup.status === 'open').slice(0, 3))
        setMeetupState(payload.availability ?? 'ready')
      })
      .catch(() => active && setMeetupState('error'))

    void fetch('/api/community/posts?feed=hot&limit=3', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as HotPostResponse
        if (!active) return
        if (!response.ok) {
          setPostState(response.status === 401 ? 'auth_required' : 'error')
          return
        }
        setPosts((payload.posts ?? []).slice(0, 3))
        setPostState(payload.availability ?? 'ready')
      })
      .catch(() => active && setPostState('error'))

    return () => {
      active = false
    }
  }, [])

  return (
    <section aria-labelledby="quantum-home-pulse-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-boot-primary">QUANTUM NOW</p>
          <h2 id="quantum-home-pulse-heading" className="mt-1 text-xl font-black">지금 캠퍼스에서 열리는 일</h2>
        </div>
      </div>

      <div className="grid gap-3">
        <LiveMeetupPanel state={meetupState} meetups={meetups} />
        <HotPostPanel state={postState} posts={posts} />
      </div>
    </section>
  )
}

function LiveMeetupPanel({ state, meetups }: { state: LoadState, meetups: MeetupRecord[] }) {
  return (
    <section className="rounded-[8px] border border-boot-hairline bg-white p-4" aria-labelledby="home-open-meetups">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black text-boot-coral"><UsersRound size={14} /> 모임</p>
          <h3 id="home-open-meetups" className="mt-1 text-lg font-black">지금 모집 중</h3>
        </div>
        <Link href="/meetups" className="flex min-h-10 shrink-0 items-center gap-1 text-xs font-black text-boot-primary">
          전체 보기 <ArrowRight size={14} />
        </Link>
      </div>

      {state === 'loading' ? <LoadingLine text="모집 중인 모임을 불러오고 있어요." /> : null}
      {state === 'ready' && meetups.length === 0 ? <EmptyState text="아직 모집 중인 모임이 없어요." href="/meetups/create" action="모임 만들기" /> : null}
      {state === 'auth_required' ? <EmptyState text="로그인하면 내 학교의 모임을 볼 수 있어요." href="/meetups" action="모임 보기" /> : null}
      {state === 'schema_unavailable' ? <EmptyState text="아직 실제 모임 목록을 열 수 없어요." href="/meetups" action="모임 둘러보기" /> : null}
      {state === 'error' ? <EmptyState text="모임을 불러오지 못했어요." href="/meetups" action="모임 보기" /> : null}
      {state === 'ready' && meetups.length > 0 ? (
        <div className="mt-3 divide-y divide-boot-hairline">
          {meetups.map((meetup) => (
            <Link key={meetup.id} href="/meetups" className="block py-3 first:pt-0 last:pb-0">
              <p className="break-words text-sm font-black">{meetup.title}</p>
              <div className="mt-2 grid gap-1 text-xs font-bold text-boot-muted">
                <span className="flex items-center gap-1.5"><CalendarDays size={13} />{formatDate(meetup.scheduled_at)}</span>
                <span className="flex items-center gap-1.5"><MapPin size={13} />{meetup.place_name}</span>
                <span className="flex items-center gap-1.5"><UsersRound size={13} />{meetup.member_count}/{meetup.capacity}명</span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function HotPostPanel({ state, posts }: { state: LoadState, posts: CommunityPost[] }) {
  return (
    <section className="rounded-[8px] border border-boot-hairline bg-white p-4" aria-labelledby="home-hot-posts">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black text-boot-coral"><Flame size={14} /> 커뮤니티</p>
          <h3 id="home-hot-posts" className="mt-1 text-lg font-black">최근 7일 핫글</h3>
        </div>
        <Link href="/community/hot" className="flex min-h-10 shrink-0 items-center gap-1 text-xs font-black text-boot-primary">
          보러 가기 <ArrowRight size={14} />
        </Link>
      </div>

      {state === 'loading' ? <LoadingLine text="최근 핫글을 불러오고 있어요." /> : null}
      {state === 'ready' && posts.length === 0 ? <EmptyState text="최근 7일 핫글이 아직 없어요." href="/community" action="커뮤니티 보기" /> : null}
      {state === 'auth_required' ? <EmptyState text="로그인하면 같은 학교의 핫글을 볼 수 있어요." href="/community" action="커뮤니티 보기" /> : null}
      {state === 'schema_unavailable' ? <EmptyState text="아직 실제 핫글 목록을 열 수 없어요." href="/community" action="커뮤니티 보기" /> : null}
      {state === 'error' ? <EmptyState text="핫글을 불러오지 못했어요." href="/community" action="커뮤니티 보기" /> : null}
      {state === 'ready' && posts.length > 0 ? (
        <div className="mt-3 divide-y divide-boot-hairline">
          {posts.map((post) => (
            <Link key={post.id} href="/community/hot" className="block py-3 first:pt-0 last:pb-0">
              <p className="break-words text-sm font-black">{post.title}</p>
              {post.body ? <p className="mt-1 line-clamp-2 break-words text-xs font-bold leading-5 text-boot-muted">{post.body}</p> : null}
              {typeof post.like_count === 'number' ? <p className="mt-2 flex items-center gap-1 text-xs font-black text-boot-coral"><Heart size={13} fill="currentColor" />좋아요 {post.like_count}</p> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function LoadingLine({ text }: { text: string }) {
  return <p className="mt-4 text-sm font-bold text-boot-muted">{text}</p>
}

function EmptyState({ text, href, action }: { text: string, href: string, action: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-[8px] bg-boot-soft px-3 py-3">
      <p className="flex min-w-0 items-center gap-2 text-xs font-bold leading-5 text-boot-muted"><CircleAlert size={15} className="shrink-0 text-boot-coral" />{text}</p>
      <Link href={href} className="shrink-0 text-xs font-black text-boot-primary">{action}</Link>
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '일정을 확인해 주세요.'

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
