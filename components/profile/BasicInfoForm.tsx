'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Gender, BodyType, HairDensity } from '@/lib/types'
import { searchDepartments } from '@/lib/pnu-departments'

export interface BasicInfoData {
  gender: Gender
  age: number
  height: number | null
  body_type: BodyType | null
  hair_density: HairDensity | null
  school: string
  department: string | null
  year: number | null
}

interface Props {
  initialValue?: Partial<BasicInfoData>
  onSubmit: (data: BasicInfoData) => void
  saving?: boolean
  serverError?: string | null
}

const BODY_TYPES: { key: BodyType; label: string; emoji: string }[] = [
  { key: 'slim',     label: '슬림',   emoji: '🪶' },
  { key: 'average',  label: '보통',   emoji: '😊' },
  { key: 'athletic', label: '근육형', emoji: '💪' },
  { key: 'chubby',   label: '통통',   emoji: '🐻' },
]

const HAIR_DENSITIES: { key: HairDensity; label: string; emoji: string }[] = [
  { key: 'full',     label: '풍성', emoji: '💇' },
  { key: 'thinning', label: '가늘음', emoji: '🧑' },
  { key: 'bald',     label: '탈모',  emoji: '🙃' },
]

export default function BasicInfoForm({ initialValue, onSubmit, saving, serverError }: Props) {
  const [gender, setGender]       = useState<Gender | null>(initialValue?.gender ?? null)
  const [age, setAge]             = useState(initialValue?.age?.toString() ?? '')
  const [height, setHeight]       = useState(initialValue?.height?.toString() ?? '')
  const [bodyType, setBodyType]   = useState<BodyType | null>(initialValue?.body_type ?? null)
  const [hairDensity, setHairDensity] = useState<HairDensity | null>(initialValue?.hair_density ?? null)
  const [school, setSchool]       = useState(initialValue?.school ?? '부산대학교')
  const [department, setDepartment] = useState(initialValue?.department ?? '')
  const [deptSuggestions, setDeptSuggestions] = useState<string[]>([])
  const [year, setYear]           = useState<number | null>(initialValue?.year ?? null)
  const [error, setError]         = useState<string | null>(null)
  const deptRef = useRef<HTMLDivElement>(null)

  const handleSubmit = useCallback(function handleSubmit() {
    if (!gender) { setError('성별을 선택해줘.'); return }
    const ageNum = parseInt(age, 10)
    if (!age || isNaN(ageNum) || ageNum < 18 || ageNum > 35) {
      setError('나이를 올바르게 입력해줘. (18~35)')
      return
    }
    if (height) {
      const h = parseInt(height, 10)
      if (isNaN(h) || h < 100 || h > 250) {
        setError('키를 올바르게 입력해줘. (100~250cm)')
        return
      }
    }
    if (!school.trim()) { setError('학교를 입력해줘.'); return }
    setError(null)
    onSubmit({
      gender,
      age: ageNum,
      height: height ? parseInt(height, 10) : null,
      body_type: bodyType,
      hair_density: gender === 'male' ? hairDensity : null,
      school: school.trim(),
      department: department.trim() || null,
      year,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, age, height, bodyType, hairDensity, school, department, year, saving, onSubmit])

  // Enter 키로 폼 제출 (텍스트 입력 focus 중에는 기본 동작 허용)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (saving) return
      if (e.key !== 'Enter') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      handleSubmit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, handleSubmit])

  const pillBase = 'py-3 rounded-2xl text-sm font-bold border transition-all duration-200'
  const pillOn   = 'btn-gradient border-transparent text-white shadow-md shadow-violet-900/30'
  const pillOff  = 'glass border-white/10 text-gray-400 hover:border-white/20'

  return (
    <div className="flex flex-col gap-6">

      {/* 성별 */}
      <div>
        <label className="text-sm font-bold mb-3 block">
          성별 <span className="text-rose-400">*</span>
        </label>
        <div className="flex gap-3">
          {(['male', 'female'] as Gender[]).map((g) => (
            <button key={g} type="button" onClick={() => setGender(g)}
              className={`flex-1 ${pillBase} ${gender === g ? pillOn : pillOff}`}>
              {g === 'male' ? '👨 남자' : '👩 여자'}
            </button>
          ))}
        </div>
      </div>

      {/* 나이 / 키 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-bold mb-3 block">
            나이 <span className="text-rose-400">*</span>
          </label>
          <input type="number" placeholder="22" value={age}
            onChange={(e) => setAge(e.target.value)}
            disabled={saving}
            className="w-full glass rounded-2xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 border border-white/10 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-sm font-bold mb-3 block">
            키 <span className="text-gray-600 font-normal text-xs">(선택)</span>
          </label>
          <div className="relative">
            <input type="number" placeholder="173" value={height}
              onChange={(e) => setHeight(e.target.value)}
              disabled={saving}
              className="w-full glass rounded-2xl px-4 py-3.5 pr-10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 border border-white/10 disabled:opacity-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">cm</span>
          </div>
        </div>
      </div>

      {/* 체형 */}
      <div>
        <label className="text-sm font-bold mb-3 block">
          체형 <span className="text-gray-600 font-normal text-xs">(선택)</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BODY_TYPES.map(({ key, label, emoji }) => (
            <button key={key} type="button"
              onClick={() => setBodyType(bodyType === key ? null : key)}
              className={`py-3 rounded-2xl text-xs font-bold border text-center transition-all duration-200 ${
                bodyType === key ? pillOn : pillOff
              }`}>
              <div className="text-base mb-0.5">{emoji}</div>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 머리숱 — 남성만 표시 */}
      {gender === 'male' && (
        <div>
          <label className="text-sm font-bold mb-3 block">
            머리숱 <span className="text-gray-600 font-normal text-xs">(선택)</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {HAIR_DENSITIES.map(({ key, label, emoji }) => (
              <button key={key} type="button"
                onClick={() => setHairDensity(hairDensity === key ? null : key)}
                className={`py-3 rounded-2xl text-xs font-bold border text-center transition-all duration-200 ${
                  hairDensity === key ? pillOn : pillOff
                }`}>
                <div className="text-base mb-0.5">{emoji}</div>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 학교 */}
      <div>
        <label className="text-sm font-bold mb-3 block">
          학교 <span className="text-rose-400">*</span>
        </label>
        <input type="text" placeholder="부산대학교" value={school}
          onChange={(e) => setSchool(e.target.value)}
          disabled={saving}
          className="w-full glass rounded-2xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 border border-white/10 disabled:opacity-50"
        />
      </div>

      {/* 학과 / 학년 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-bold mb-3 block">
            학과 <span className="text-gray-600 font-normal text-xs">(선택)</span>
          </label>
          <div ref={deptRef} className="relative">
            <input
              type="text"
              placeholder="컴퓨터공학과"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value)
                setDeptSuggestions(searchDepartments(e.target.value))
              }}
              onBlur={() => setTimeout(() => setDeptSuggestions([]), 150)}
              disabled={saving}
              className="w-full glass rounded-2xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 border border-white/10 disabled:opacity-50"
            />
            {deptSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 glass-strong rounded-2xl border border-white/10 overflow-hidden z-10">
                {deptSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={() => {
                      setDepartment(s)
                      setDeptSuggestions([])
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-sm font-bold mb-3 block">
            학년 <span className="text-gray-600 font-normal text-xs">(선택)</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <button key={y} type="button"
                onClick={() => setYear(year === y ? null : y)}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 ${
                  year === y ? pillOn : pillOff
                }`}>
                {y}학년
              </button>
            ))}
          </div>
        </div>
      </div>

      {(error || serverError) && (
        <p className="text-xs text-red-400 text-center">{error || serverError}</p>
      )}

      <button onClick={handleSubmit} disabled={saving}
        className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? '저장 중...' : '다음'}
      </button>
    </div>
  )
}
