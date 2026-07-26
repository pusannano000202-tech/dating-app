'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Search } from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue } from '@/lib/dev-auth'
import SchoolMascot from '@/components/theme/SchoolMascot'
import {
  DEV_SCHOOL_PREVIEW_CHANGE_EVENT,
  DEV_SCHOOL_PREVIEW_STORAGE_KEY,
  DEV_SCHOOL_PREVIEWS,
  persistDevSchoolPreview,
  readStoredDevSchoolPreview,
  type DevSchoolPreview,
} from '@/lib/dev-school-preview'
import { DEV_BASIC_PROFILE_STORAGE_KEY } from '@/lib/profile/dev-basic-profile'

const quickRoutes = [
  { href: '/', label: '홈' },
  { href: '/profile/basic', label: '기본정보' },
  { href: '/profile/worldcup', label: '이상형' },
  { href: '/match', label: '매칭' },
  { href: '/group/create?size=3', label: '그룹' },
  { href: '/meetups', label: '모임' },
  { href: '/community', label: '커뮤니티' },
]

function seedPreviewProfile(school: DevSchoolPreview): void {
  const previewProfile = {
    display_name: `${school.shortName} 미리보기`,
    phone: '010-1234-5678',
    gender: 'male',
    age: 22,
    height: 173,
    body_type: 'average',
    hair_density: 'full',
    school: school.name,
    department: null,
    year: 3,
  }

  window.sessionStorage.setItem(DEV_BASIC_PROFILE_STORAGE_KEY, JSON.stringify(previewProfile))
}

function persistSchool(school: DevSchoolPreview): void {
  persistDevSchoolPreview(school)

  try {
    window.localStorage.setItem(DEV_SCHOOL_PREVIEW_STORAGE_KEY, school.id)
    window.localStorage.setItem(DEV_AUTH_COOKIE, getDevAuthCookieValue())
  } catch {}

  try {
    document.cookie = `${DEV_AUTH_COOKIE}=${getDevAuthCookieValue()}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`
  } catch {}

  try {
    seedPreviewProfile(school)
  } catch {}

  window.dispatchEvent(new Event(DEV_SCHOOL_PREVIEW_CHANGE_EVENT))
}

function withSchoolParam(href: string, schoolId: string): string {
  const [path, search = ''] = href.split('?')
  const params = new URLSearchParams(search)
  params.set('school', schoolId)
  return `${path}?${params.toString()}`
}

export default function DevSchoolPreviewSwitcher() {
  const [selected, setSelected] = useState<DevSchoolPreview>(DEV_SCHOOL_PREVIEWS[0])
  const [query, setQuery] = useState('')

  useEffect(() => {
    setSelected(readStoredDevSchoolPreview())
  }, [])

  const filteredSchools = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const schools = normalized
      ? DEV_SCHOOL_PREVIEWS.filter((school) =>
          [school.name, school.shortName, school.region, school.id]
            .some((value) => value.toLowerCase().includes(normalized)),
        )
      : DEV_SCHOOL_PREVIEWS

    return [...schools].sort((a, b) => a.shortName.localeCompare(b.shortName, 'ko-KR'))
  }, [query])

  function selectSchool(school: DevSchoolPreview): void {
    setSelected(school)
    persistSchool(school)
  }

  return (
    <section className="mb-5 overflow-hidden rounded-[30px] border border-boot-primary/20 bg-white/90 shadow-[0_18px_44px_rgba(23,20,18,0.08)]">
      <div
        className="px-5 py-5 text-white"
        style={{
          background: `linear-gradient(135deg, ${selected.primary}, ${selected.coral} 62%, ${selected.amber})`,
        }}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">
          School Frontend Preview
        </p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_112px] items-end gap-3">
          <div>
            <h2 className="text-2xl font-black leading-tight">{selected.shortName}</h2>
            <p className="mt-1 text-xs font-bold text-white/78">{selected.name} · {selected.region}</p>
            <span className="mt-3 inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-black">
              로그인 우회 ON
            </span>
          </div>
          <SchoolMascot
            pose="welcome"
            size="lg"
            className="h-28 w-28 rounded-[26px] border border-white/45 bg-white/82 shadow-[0_16px_28px_rgba(23,20,18,0.18)]"
          />
        </div>
      </div>

      <div className="px-4 py-4">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-boot-muted" />
          <input
            aria-label="학교 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="학교명, 지역, id 검색"
            className="h-12 w-full rounded-2xl border border-boot-hairline bg-white pl-10 pr-4 text-sm font-bold text-boot-ink outline-none focus:border-boot-primary"
          />
        </label>

        <div className="mt-3 flex items-center justify-between text-[11px] font-black text-boot-muted">
          <span>학교 {filteredSchools.length}개</span>
          <span>가나다순</span>
        </div>

        <div className="mt-2 grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {filteredSchools.map((school) => {
            const isSelected = selected.id === school.id
            return (
              <button
                key={school.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectSchool(school)}
                className={[
                  'min-h-[64px] rounded-2xl border px-3 py-2 text-left transition',
                  isSelected
                    ? 'border-boot-primary bg-boot-soft text-boot-primary shadow-sm'
                    : 'border-boot-hairline bg-white text-boot-body hover:border-boot-primary/35',
                ].join(' ')}
              >
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block text-sm font-black">{school.shortName}</span>
                    <span className="mt-0.5 block text-[10px] font-bold text-boot-muted">{school.region}</span>
                  </span>
                  {isSelected ? <Check size={15} className="mt-0.5 flex-shrink-0" /> : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {quickRoutes.map((route) => (
            <Link
              key={route.href}
              href={withSchoolParam(route.href, selected.id)}
              onClick={() => persistSchool(selected)}
              className="flex h-12 items-center justify-between rounded-2xl bg-boot-ink px-4 text-sm font-black text-white"
            >
              <span>{route.label}</span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
