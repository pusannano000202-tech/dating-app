'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

import CampusEatsCategoryIcon from '@/components/campus-eats/CampusEatsCategoryIcon'
import CampusEatsPilot from '@/components/campus-eats/CampusEatsPilot'
import { PNU_CAMPUS_EATS_CATEGORIES } from '@/lib/campus-eats/fixtures/pnu-categories'

function CampusEatsCategoryChooser() {
  return (
    <main className="min-h-screen bg-[#fff9f6] px-4 pb-20 pt-5 text-[#292321]">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/community" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#77645b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B94B3F]">
          <ArrowLeft size={18} aria-hidden="true" /> 커뮤니티 돌아가기
        </Link>

        <section className="mt-6 rounded-2xl border border-[#eadbd4] bg-white p-5 sm:p-7" aria-labelledby="campus-eats-entry-heading">
          <p className="text-xs font-black text-[#B94B3F]">부산대 앞 · 방문 맛집 월드컵</p>
          <h1 id="campus-eats-entry-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">어떤 음식부터 골라볼까요?</h1>
          <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-[#77645b]">음식을 고른 뒤 먹어본 맛집끼리 비교해요. 이전 결과는 자동으로 열지 않아요.</p>

          <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="방문 맛집 월드컵 음식 종류 선택">
            {PNU_CAMPUS_EATS_CATEGORIES.map((category) => (
              <Link
                key={category.id}
                href={`/community/campus-eats?mode=setup&category=${category.id}`}
                className="group flex min-h-11 flex-col rounded-xl border border-[#eadbd4] bg-[#fffdfb] p-3 text-left transition hover:border-[#B94B3F] hover:bg-[#fff5ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B94B3F]"
              >
                <span className="flex items-center gap-2 text-[#B94B3F]">
                  <CampusEatsCategoryIcon categoryId={category.id} size={20} />
                  <span className="text-sm font-black text-[#292321]">{category.label}</span>
                </span>
                <span className="mt-2 flex items-center justify-between text-xs font-bold text-[#77645b]">
                  {category.candidates.length}곳 비교하기 <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </main>
  )
}

export default function CampusEatsEntry() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const category = searchParams.get('category')

  if (mode === 'choose' || (!category && mode !== 'map')) {
    return <CampusEatsCategoryChooser />
  }

  return <CampusEatsPilot />
}
