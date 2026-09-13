'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Flame, MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react'

import { communityCategoryCatalog, getCommunityCategory } from '@/lib/community/catalog'
import type { CommunityPost } from './CommunityBoard'

type HotState = 'loading' | 'ready' | 'auth_required' | 'schema_unavailable' | 'error'

export default function HotCommunityBoard() {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [state, setState] = useState<HotState>('loading')
  const pending = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setState('loading')
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
        const response = await fetch('/api/community/posts?feed=hot', { cache: 'no-store', signal: controller.signal })
        const payload = await response.json().catch(() => ({})) as { posts?: CommunityPost[]; availability?: HotState }
        if (pending.current !== controller) return
        if (!response.ok) setState(response.status === 401 ? 'auth_required' : 'error')
        else {
          setPosts(payload.posts ?? [])
          setState(payload.availability ?? 'ready')
        }
    } catch { if (pending.current === controller) setState('error') }
    finally { clearTimeout(timeout); if (pending.current === controller) pending.current = null }
  }, [])

  useEffect(() => {
    void load()
    return () => { pending.current?.abort(); pending.current = null }
  }, [load])

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-6">
        <header className="flex items-start gap-3 border-b border-boot-hairline pb-4">
          <Link href="/community" aria-label="커뮤니티로 돌아가기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-muted"><ArrowLeft size={19} /></Link>
          <div><p className="flex items-center gap-1.5 text-xs font-black text-[#E65D4D]"><Flame size={15} /> 최근 7일</p><h1 className="mt-1 text-2xl font-black">핫 게시판</h1><p className="mt-2 text-sm font-bold text-boot-muted">좋아요가 많고 싫어요가 적은 글부터 보여줘요.</p></div>
        </header>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 py-4 sm:-mx-6 sm:px-6" aria-label="커뮤니티 카테고리">
          <span className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-boot-ink px-3 text-xs font-black text-white"><Flame size={14} /> 핫</span>
          {communityCategoryCatalog.map((entry) => <Link key={entry.id} href={entry.href} className="flex min-h-10 shrink-0 items-center rounded-lg border border-boot-hairline bg-white px-3 text-xs font-black text-boot-muted">{entry.title}</Link>)}
        </nav>

        {state === 'loading' ? <p role="status" className="py-8 text-sm font-bold text-boot-muted">핫 게시글을 모으고 있어요.</p> : null}
        {state === 'auth_required' ? <Notice text="로그인하면 같은 학교의 핫 게시글을 볼 수 있어요." /> : null}
        {state === 'auth_required' ? <Link href="/login?redirect=%2Fcommunity%2Fhot" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-boot-ink px-4 text-sm font-bold text-white">로그인하고 이어 보기</Link> : null}
        {state === 'schema_unavailable' ? <Notice text="핫 게시판 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." /> : null}
        {state === 'error' ? <Notice text="핫 게시글을 불러오지 못했어요." /> : null}
        {state === 'error' || state === 'schema_unavailable' ? <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-boot-hairline bg-white px-4 text-sm font-bold text-boot-ink">다시 시도</button> : null}
        {state === 'ready' && posts.length === 0 ? <Notice text="최근 7일 동안 아직 반응을 받은 글이 없어요." /> : null}
        {state === 'ready' && posts.length ? (
          <div className="divide-y divide-boot-hairline border-y border-boot-hairline bg-white">
            {posts.map((post, index) => {
              const board = getCommunityCategory(post.category)
              return (
                <Link key={post.id} href={`/community/${post.category}/${post.id}`} className="block p-4 transition-colors hover:bg-boot-soft">
                  <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF0ED] text-sm font-black text-[#E65D4D]">{index + 1}</span><div className="min-w-0"><p className="text-[11px] font-black text-boot-primary">{board?.title ?? '커뮤니티'}</p><h2 className="mt-1 break-words text-base font-black">{post.title}</h2><p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-boot-muted">{post.body}</p><p className="mt-3 flex items-center gap-3 text-xs font-black"><span className="flex items-center gap-1 text-[#D84E40]"><ThumbsUp size={15} /> {post.like_count ?? 0}</span><span className="flex items-center gap-1 text-boot-muted"><ThumbsDown size={15} /> {post.dislike_count ?? 0}</span><span className="flex items-center gap-1 text-boot-muted"><MessageCircle size={15} /> {post.comment_count ?? 0}</span></p></div></div>
                </Link>
              )
            })}
          </div>
        ) : null}
      </div>
    </main>
  )
}

function Notice({ text }: { text: string }) {
  return <p className="rounded-lg border border-boot-hairline bg-white p-4 text-sm font-bold leading-6 text-boot-muted">{text}</p>
}
