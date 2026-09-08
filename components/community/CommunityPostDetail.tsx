'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  MessageCircleReply,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react'

import {
  COMMUNITY_COMMENT_BODY_MAX,
  type CommunityCategory,
  type CommunityReaction,
} from '@/lib/community/contracts'
import type { CommunityPost } from './CommunityBoard'

type CommunityComment = {
  id: string
  post_id: string
  parent_comment_id: string | null
  depth: number
  body: string
  author_alias: string
  is_author: boolean
  is_deleted: boolean
  created_at: string
  like_count: number
  liked_by_me: boolean
  dislike_count: number
  disliked_by_me: boolean
}

type LoadState = 'loading' | 'ready' | 'not_found' | 'unauthorized' | 'error'

type Props = {
  board: {
    id: CommunityCategory
    title: string
    description: string
    href: string
  }
  postId: string
  devPreview?: boolean
}

const previewPost: CommunityPost = {
  id: 'preview-post',
  category: 'relationship-advice',
  title: '친구에서 연인으로 넘어가도 될까요?',
  body: '같은 과 친구와 자주 밥을 먹고 카페도 가요. 서로 편한 사이라고 생각했는데, 요즘은 저만 조금 더 마음이 생긴 것 같아요. 분위기를 어색하게 만들지 않고 마음을 확인할 방법이 있을까요?',
  author_alias: '익명',
  created_at: '2026-08-13T11:44:00.000Z',
  like_count: 12,
  dislike_count: 1,
  comment_count: 4,
  liked_by_me: false,
  disliked_by_me: false,
}

const previewComments: CommunityComment[] = [
  {
    id: 'preview-comment-1', post_id: 'preview-post', parent_comment_id: null, depth: 0,
    body: '둘이 만나는 시간이 계속 이어진다면 가볍게 다음 약속부터 제안해 보는 건 어때요?', author_alias: '익명1',
    is_author: false, is_deleted: false, created_at: '2026-08-13T11:51:00.000Z', like_count: 8, liked_by_me: false, dislike_count: 0, disliked_by_me: false,
  },
  {
    id: 'preview-comment-2', post_id: 'preview-post', parent_comment_id: 'preview-comment-1', depth: 1,
    body: '저도 이 방법이 가장 부담이 적을 것 같아요.', author_alias: '익명2',
    is_author: false, is_deleted: false, created_at: '2026-08-13T11:56:00.000Z', like_count: 3, liked_by_me: false, dislike_count: 0, disliked_by_me: false,
  },
  {
    id: 'preview-comment-3', post_id: 'preview-post', parent_comment_id: 'preview-comment-2', depth: 2,
    body: '다음 약속에서도 분위기가 좋으면 그때 솔직하게 말해도 늦지 않겠네요.', author_alias: '익명3',
    is_author: false, is_deleted: false, created_at: '2026-08-13T12:01:00.000Z', like_count: 2, liked_by_me: false, dislike_count: 0, disliked_by_me: false,
  },
  {
    id: 'preview-comment-4', post_id: 'preview-post', parent_comment_id: null, depth: 0,
    body: '서두르기보다는 상대도 둘만의 약속을 먼저 잡는지 한 번 봐도 좋을 것 같아요.', author_alias: '나',
    is_author: true, is_deleted: false, created_at: '2026-08-13T12:08:00.000Z', like_count: 1, liked_by_me: false, dislike_count: 0, disliked_by_me: false,
  },
]

export default function CommunityPostDetail({ board, postId, devPreview = false }: Props) {
  const [post, setPost] = useState<CommunityPost | null>(devPreview ? previewPost : null)
  const [comments, setComments] = useState<CommunityComment[]>(devPreview ? previewComments : [])
  const [state, setState] = useState<LoadState>(devPreview ? 'ready' : 'loading')
  const [body, setBody] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reactionBusy, setReactionBusy] = useState<string | null>(null)

  const loadPost = useCallback(async () => {
    if (devPreview) {
      setState('ready')
      return
    }
    setState('loading')
    const [postResponse, commentsResponse] = await Promise.all([
      fetch(`/api/community/posts/${postId}`, { cache: 'no-store' }),
      fetch(`/api/community/posts/${postId}/comments`, { cache: 'no-store' }),
    ]).catch(() => [null, null] as const)

    if (!postResponse || !commentsResponse) {
      setState('error')
      return
    }
    if (postResponse.status === 401 || commentsResponse.status === 401) {
      setState('unauthorized')
      return
    }
    if (postResponse.status === 404) {
      setState('not_found')
      return
    }
    if (!postResponse.ok || !commentsResponse.ok) {
      setState('error')
      return
    }

    const postPayload = await postResponse.json() as { post?: CommunityPost }
    const commentsPayload = await commentsResponse.json() as { comments?: CommunityComment[] }
    if (!postPayload.post || postPayload.post.category !== board.id) {
      setState('not_found')
      return
    }

    setPost(postPayload.post)
    setComments(commentsPayload.comments ?? [])
    setState('ready')
  }, [board.id, devPreview, postId])

  useEffect(() => {
    void loadPost()
  }, [loadPost])

  const childrenByParent = useMemo(() => {
    const grouped = new Map<string | null, CommunityComment[]>()
    for (const comment of comments) {
      const parentId = comment.parent_comment_id ?? null
      grouped.set(parentId, [...(grouped.get(parentId) ?? []), comment])
    }
    return grouped
  }, [comments])

  async function submitComment(event: FormEvent<HTMLFormElement>, parentCommentId: string | null) {
    event.preventDefault()
    const draft = parentCommentId ? replyBody : body
    const normalizedBody = draft.trim()
    if (!normalizedBody || normalizedBody.length > COMMUNITY_COMMENT_BODY_MAX) return

    if (devPreview) {
      const parent = parentCommentId
        ? comments.find((comment) => comment.id === parentCommentId)
        : null
      const previewComment: CommunityComment = {
        id: `preview-comment-${Date.now()}`,
        post_id: postId,
        parent_comment_id: parentCommentId,
        depth: parent ? Math.min(parent.depth + 1, 2) : 0,
        body: normalizedBody,
        author_alias: '나',
        is_author: true,
        is_deleted: false,
        created_at: new Date().toISOString(),
        like_count: 0,
        liked_by_me: false,
        dislike_count: 0,
        disliked_by_me: false,
      }
      setComments((current) => [...current, previewComment])
      setPost((current) => current ? { ...current, comment_count: (current.comment_count ?? 0) + 1 } : current)
      if (parentCommentId) {
        setReplyBody('')
        setReplyingTo(null)
      } else {
        setBody('')
      }
      return
    }

    setBusy(true)
    setNotice('')
    const response = await fetch(`/api/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: normalizedBody,
        ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
      }),
    }).catch(() => null)

    const payload = response ? await response.json().catch(() => ({})) as {
      comment?: CommunityComment
      error?: string
    } : {}
    if (!response?.ok || !payload.comment) {
      setNotice(mapCommentError(payload.error))
      setBusy(false)
      return
    }

    setComments((current) => [...current, payload.comment as CommunityComment])
    setPost((current) => current
      ? { ...current, comment_count: (current.comment_count ?? 0) + 1 }
      : current)
    if (parentCommentId) {
      setReplyBody('')
      setReplyingTo(null)
      setCollapsed((current) => {
        const next = new Set(current)
        next.delete(parentCommentId)
        return next
      })
    } else {
      setBody('')
    }
    setBusy(false)
  }

  async function deleteComment(commentId: string) {
    if (!devPreview) {
      const response = await fetch(`/api/community/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      }).catch(() => null)
      if (!response?.ok) {
        setNotice('댓글을 삭제하지 못했어요. 본인이 작성한 댓글인지 확인해 주세요.')
        return
      }
    }

    setComments((current) => current.map((comment) => comment.id === commentId
      ? {
          ...comment,
          body: '삭제된 댓글입니다.',
          author_alias: '익명',
          is_author: false,
          is_deleted: true,
          like_count: 0,
          dislike_count: 0,
          liked_by_me: false,
          disliked_by_me: false,
        }
      : comment))
    setPost((current) => current
      ? { ...current, comment_count: Math.max(0, (current.comment_count ?? 1) - 1) }
      : current)
  }

  async function togglePostReaction(reaction: CommunityReaction) {
    if (!post || reactionBusy) return
    if (devPreview) {
      setPost((current) => current ? toggleLocalReaction(current, reaction) : current)
      return
    }
    setReactionBusy(`post:${reaction}`)
    const response = await fetch(`/api/community/posts/${postId}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    }).catch(() => null)
    const payload = response ? await response.json().catch(() => ({})) as ReactionPayload : {}
    if (response?.ok) {
      setPost((current) => current ? applyReaction(current, payload) : current)
    } else {
      setNotice(mapReactionError(payload.error))
    }
    setReactionBusy(null)
  }

  async function toggleCommentReaction(commentId: string, reaction: CommunityReaction) {
    if (reactionBusy) return
    if (devPreview) {
      setComments((current) => current.map((comment) => comment.id === commentId
        ? toggleLocalReaction(comment, reaction)
        : comment))
      return
    }
    setReactionBusy(`${commentId}:${reaction}`)
    const response = await fetch(`/api/community/posts/${postId}/comments/${commentId}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    }).catch(() => null)
    const payload = response ? await response.json().catch(() => ({})) as ReactionPayload : {}
    if (response?.ok) {
      setComments((current) => current.map((comment) => comment.id === commentId
        ? applyReaction(comment, payload)
        : comment))
    } else {
      setNotice(mapReactionError(payload.error))
    }
    setReactionBusy(null)
  }

  function toggleReplies(commentId: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }

  function renderComment(comment: CommunityComment): React.ReactNode {
    const children = childrenByParent.get(comment.id) ?? []
    const isCollapsed = collapsed.has(comment.id)
    const collapseLabel = isCollapsed
      ? `답글 ${children.length}개 보기`
      : `답글 ${children.length}개 숨기기`
    const canReply = !comment.is_deleted && comment.depth < 2

    return (
      <article
        key={comment.id}
        className={`border-b border-boot-hairline py-4 ${comment.depth > 0 ? 'ml-3 border-l-2 border-[#E7CFC9] pl-3 sm:ml-8 sm:pl-4' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F4E2DD] text-[11px] font-black text-[#965E52]">
                익
              </span>
              <p className="text-xs font-black text-[#A34A3D]">{comment.author_alias || '익명'}</p>
            </div>
            <p className={`mt-2 whitespace-pre-wrap break-words text-[15px] font-bold leading-6 ${comment.is_deleted ? 'text-boot-muted' : ''}`}>
              {comment.body}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold text-boot-muted">
              <span>{formatDate(comment.created_at)}</span>
              {!comment.is_deleted ? (
                <>
                  <button type="button" onClick={() => void toggleCommentReaction(comment.id, 'like')} aria-pressed={comment.liked_by_me} className={comment.liked_by_me ? 'text-[#D84E40]' : 'hover:text-[#D84E40]'}>
                    좋아요 {comment.like_count}
                  </button>
                  <button type="button" onClick={() => void toggleCommentReaction(comment.id, 'dislike')} aria-pressed={comment.disliked_by_me} className={comment.disliked_by_me ? 'text-[#4F4A47]' : 'hover:text-[#4F4A47]'}>
                    싫어요 {comment.dislike_count}
                  </button>
                </>
              ) : null}
              {canReply ? (
                <button type="button" onClick={() => { setReplyingTo(comment.id); setReplyBody('') }} className="inline-flex items-center gap-1 hover:text-boot-primary">
                  <MessageCircleReply size={13} /> 답글
                </button>
              ) : null}
            </div>
          </div>
          {comment.is_author ? (
            <button type="button" onClick={() => void deleteComment(comment.id)} aria-label="내 댓글 삭제" className="flex h-10 w-10 shrink-0 items-center justify-center text-boot-muted hover:text-[#D84E40]">
              <Trash2 size={17} />
            </button>
          ) : null}
        </div>

        {replyingTo === comment.id ? (
          <form onSubmit={(event) => void submitComment(event, comment.id)} className="mt-3 rounded-lg bg-[#FFF7F3] p-3">
            <label htmlFor={`reply-${comment.id}`} className="text-xs font-black text-[#965E52]">익명으로 답글 쓰기</label>
            <textarea id={`reply-${comment.id}`} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={COMMUNITY_COMMENT_BODY_MAX} rows={3} autoFocus className="mt-2 w-full resize-none rounded-lg border border-[#E7CFC9] bg-white px-3 py-2 text-sm font-bold leading-6 outline-none focus-visible:border-[#C97A69]" />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setReplyingTo(null)} className="min-h-10 px-3 text-xs font-black text-boot-muted">취소</button>
              <button type="submit" disabled={busy || !replyBody.trim()} className="min-h-10 rounded-lg bg-[#C96F60] px-4 text-xs font-black text-white disabled:opacity-45">답글 등록</button>
            </div>
          </form>
        ) : null}

        {children.length > 0 ? (
          <>
            <button type="button" onClick={() => toggleReplies(comment.id)} className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-black text-[#965E52]">
              {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              {collapseLabel}
            </button>
            {!isCollapsed ? <div>{children.map(renderComment)}</div> : null}
          </>
        ) : null}
      </article>
    )
  }

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 sm:px-6">
        <header className="flex items-start gap-3 border-b border-boot-hairline pb-4">
          <Link href={board.href} aria-label={`${board.title} 목록으로 돌아가기`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-muted">
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="text-xs font-black text-[#A34A3D]">{board.title}</p>
            <h1 className="mt-1 text-2xl font-black">게시글</h1>
          </div>
        </header>

        {state === 'loading' ? <Status text="게시글과 댓글을 불러오는 중이에요." /> : null}
        {state === 'unauthorized' ? <Status text="로그인하면 같은 학교의 글과 댓글을 볼 수 있어요." /> : null}
        {state === 'not_found' ? <Status text="삭제되었거나 볼 수 없는 게시글이에요." /> : null}
        {state === 'error' ? <Status text="게시글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." /> : null}

        {state === 'ready' && post ? (
          <>
            <article className="border-b border-boot-hairline bg-white px-4 py-5 sm:px-5">
              <p className="text-xs font-black text-[#A34A3D]">익명</p>
              <h2 className="mt-3 break-words text-xl font-black leading-8">{post.title}</h2>
              <p className="mt-2 text-xs font-bold text-boot-muted">{formatDate(post.created_at ?? '')}</p>
              <p className="mt-5 whitespace-pre-wrap break-words text-[15px] font-bold leading-7 text-boot-ink">{post.body}</p>
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-boot-hairline pt-4">
                <ReactionButton reaction="like" active={Boolean(post.liked_by_me)} count={post.like_count ?? 0} busy={Boolean(reactionBusy)} onClick={togglePostReaction} />
                <ReactionButton reaction="dislike" active={Boolean(post.disliked_by_me)} count={post.dislike_count ?? 0} busy={Boolean(reactionBusy)} onClick={togglePostReaction} />
                <span className="flex min-h-11 items-center gap-2 px-2 text-sm font-black text-boot-muted"><MessageCircle size={17} /> 댓글 {post.comment_count ?? comments.filter((comment) => !comment.is_deleted).length}</span>
              </div>
            </article>

            <section aria-labelledby="community-comments-heading" className="mt-4 bg-white px-4 py-5 sm:px-5">
              <h2 id="community-comments-heading" className="text-lg font-black">댓글 <span className="text-[#A34A3D]">{comments.filter((comment) => !comment.is_deleted).length}</span></h2>
              <div className="mt-3 border-t border-boot-hairline">
                {(childrenByParent.get(null) ?? []).length === 0 ? <p className="py-8 text-center text-sm font-bold text-boot-muted">첫 댓글을 남겨주세요.</p> : null}
                {(childrenByParent.get(null) ?? []).map(renderComment)}
              </div>

              <form onSubmit={(event) => void submitComment(event, null)} className="sticky bottom-16 mt-5 rounded-lg border border-[#E7CFC9] bg-[#FFFDFB] p-3 shadow-[0_-8px_24px_rgba(93,57,48,0.08)]" noValidate>
                <label htmlFor="community-comment" className="text-sm font-black">익명으로 댓글 쓰기</label>
                <textarea id="community-comment" value={body} onChange={(event) => setBody(event.target.value)} maxLength={COMMUNITY_COMMENT_BODY_MAX} rows={3} placeholder="상대방을 존중하는 댓글을 남겨주세요." className="mt-2 w-full resize-none rounded-lg border border-boot-hairline bg-white px-3 py-3 text-sm font-bold leading-6 outline-none focus-visible:border-[#C97A69]" />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-boot-muted">{body.trim().length}/{COMMUNITY_COMMENT_BODY_MAX}</span>
                  <button type="submit" disabled={busy || body.trim().length === 0} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#C96F60] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                    <Send size={15} /> {busy ? '등록 중' : '댓글 등록'}
                  </button>
                </div>
                {notice ? <p className="mt-3 text-xs font-black text-[#D84E40]" role="status">{notice}</p> : null}
              </form>
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}

type ReactionPayload = {
  liked?: boolean
  disliked?: boolean
  like_count?: number
  dislike_count?: number
  error?: string
}

function applyReaction<T extends { liked_by_me?: boolean; disliked_by_me?: boolean; like_count?: number; dislike_count?: number }>(item: T, payload: ReactionPayload): T {
  return {
    ...item,
    liked_by_me: Boolean(payload.liked),
    disliked_by_me: Boolean(payload.disliked),
    like_count: payload.like_count ?? item.like_count ?? 0,
    dislike_count: payload.dislike_count ?? item.dislike_count ?? 0,
  } as T
}

function toggleLocalReaction<T extends { liked_by_me?: boolean; disliked_by_me?: boolean; like_count?: number; dislike_count?: number }>(item: T, reaction: CommunityReaction): T {
  const wasLiked = Boolean(item.liked_by_me)
  const wasDisliked = Boolean(item.disliked_by_me)
  const nextLiked = reaction === 'like' ? !wasLiked : false
  const nextDisliked = reaction === 'dislike' ? !wasDisliked : false

  return {
    ...item,
    liked_by_me: nextLiked,
    disliked_by_me: nextDisliked,
    like_count: Math.max(0, (item.like_count ?? 0) + (nextLiked ? 1 : 0) - (wasLiked ? 1 : 0)),
    dislike_count: Math.max(0, (item.dislike_count ?? 0) + (nextDisliked ? 1 : 0) - (wasDisliked ? 1 : 0)),
  } as T
}

function ReactionButton({ reaction, active, count, busy, onClick }: {
  reaction: CommunityReaction
  active: boolean
  count: number
  busy: boolean
  onClick: (reaction: CommunityReaction) => void
}) {
  const isLike = reaction === 'like'
  const Icon = isLike ? ThumbsUp : ThumbsDown
  return (
    <button type="button" onClick={() => void onClick(reaction)} disabled={busy} aria-pressed={active} className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-black transition-colors ${active ? (isLike ? 'border-[#E65D4D] bg-[#FFF0ED] text-[#D84E40]' : 'border-[#6B645F] bg-[#F1EFED] text-[#3F3A37]') : 'border-boot-hairline bg-white text-boot-muted hover:bg-boot-soft'}`}>
      <Icon size={17} fill={active ? 'currentColor' : 'none'} /> {isLike ? '좋아요' : '싫어요'} {count}
    </button>
  )
}

function Status({ text }: { text: string }) {
  return <p className="mt-5 border-y border-boot-hairline bg-white px-4 py-6 text-sm font-bold leading-6 text-boot-muted">{text}</p>
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const koreanTime = new Date(date.getTime() + (9 * 60 * 60 * 1000))
  const hour24 = koreanTime.getUTCHours()
  const hour12 = hour24 % 12 || 12
  const minutes = String(koreanTime.getUTCMinutes()).padStart(2, '0')
  return `${koreanTime.getUTCMonth() + 1}. ${koreanTime.getUTCDate()}. ${hour24 >= 12 ? '오후' : '오전'} ${String(hour12).padStart(2, '0')}:${minutes}`
}

function mapCommentError(error?: string) {
  if (error === 'rate_limited') return '댓글을 너무 빠르게 등록했어요. 잠시 후 다시 시도해 주세요.'
  if (error === 'reply_depth_exceeded') return '답글은 세 단계까지만 이어갈 수 있어요.'
  if (error === 'invalid_parent_comment') return '답글을 달 댓글을 다시 확인해 주세요.'
  return '댓글을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function mapReactionError(error?: string) {
  return error === 'rate_limited'
    ? '짧은 시간에 반응을 너무 많이 바꿨어요. 잠시 후 다시 시도해 주세요.'
    : '반응을 반영하지 못했어요.'
}
