import Link from 'next/link'
import { ArrowUpRight, MessagesSquare } from 'lucide-react'
import { STORY_PROMPTS } from '@/lib/community/story-prompts'

export default function StoryStarters() {
  return <section className="my-7 rounded-3xl border border-boot-hairline bg-white p-5" aria-labelledby="story-starters-title">
    <p className="flex items-center gap-2 text-xs font-black text-boot-primary"><MessagesSquare size={16}/>운영자가 제안하는 이야기 주제</p>
    <h2 id="story-starters-title" className="mt-2 text-xl font-black">어떤 이야기부터 꺼내볼까요?</h2>
    <p className="mt-2 text-sm leading-6 text-boot-muted">학생이 작성한 글이 아닌, 글쓰기를 돕는 질문이에요.</p>
    <div className="mt-4 divide-y divide-boot-hairline">{STORY_PROMPTS.map(prompt => <Link key={prompt.id} href={`/community/${prompt.category}?starter=${prompt.id}`} className="group flex min-h-24 items-center gap-4 py-4">
      <span className="min-w-0 flex-1"><span className="text-xs font-bold text-boot-muted">{prompt.tag}</span><strong className="mt-1 block break-keep leading-6">{prompt.title}</strong><span className="mt-2 block text-xs font-bold text-boot-primary">글 초안 열기</span></span><ArrowUpRight size={20} className="shrink-0 text-boot-primary"/>
    </Link>)}</div>
    <p className="text-xs leading-5 text-boot-muted">초안은 직접 고친 뒤 게시해요. 누르는 것만으로 공개되지 않아요.</p>
  </section>
}
