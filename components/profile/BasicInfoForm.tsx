'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, GraduationCap, Phone, Ruler, UserRound } from 'lucide-react'
import type { BodyType, Gender, HairDensity } from '@/lib/types'
import { searchDepartments } from '@/lib/pnu-departments'

export interface BasicInfoData {
  display_name: string
  phone: string
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

const BODY_TYPES: { key: BodyType; label: string; description: string }[] = [
  { key: 'slim', label: '슬림', description: '마른 편' },
  { key: 'average', label: '보통', description: '평균 체형' },
  { key: 'athletic', label: '운동형', description: '탄탄한 편' },
  { key: 'chubby', label: '통통', description: '부드러운 편' },
]

const HAIR_DENSITIES: { key: HairDensity; label: string; description: string }[] = [
  { key: 'full', label: '풍성', description: '머리숱 많음' },
  { key: 'thinning', label: '보통', description: '평균 또는 적은 편' },
  { key: 'bald', label: '없음', description: '탈모 또는 민머리' },
]

const GENDER_OPTIONS: { key: Gender; label: string; description: string }[] = [
  { key: 'male', label: '남자', description: '남자 그룹으로 매칭돼요' },
  { key: 'female', label: '여자', description: '여자 그룹으로 매칭돼요' },
]

export default function BasicInfoForm({ initialValue, onSubmit, saving, serverError }: Props) {
  const [displayName, setDisplayName] = useState(initialValue?.display_name ?? '')
  const [phone, setPhone] = useState(initialValue?.phone ?? '')
  const [gender, setGender] = useState<Gender | null>(initialValue?.gender ?? null)
  const [age, setAge] = useState(initialValue?.age?.toString() ?? '')
  const [height, setHeight] = useState(initialValue?.height?.toString() ?? '')
  const [bodyType, setBodyType] = useState<BodyType | null>(initialValue?.body_type ?? null)
  const [hairDensity, setHairDensity] = useState<HairDensity | null>(initialValue?.hair_density ?? null)
  const [school, setSchool] = useState(initialValue?.school ?? '부산대학교')
  const [department, setDepartment] = useState(initialValue?.department ?? '')
  const [deptSuggestions, setDeptSuggestions] = useState<string[]>([])
  const [year, setYear] = useState<number | null>(initialValue?.year ?? null)
  const [error, setError] = useState<string | null>(null)
  const deptRef = useRef<HTMLDivElement>(null)

  const requiredDone = [
    displayName.trim().length >= 2,
    !!gender,
    !!age,
    !!normalizePhone(phone),
    !!school.trim(),
  ].filter(Boolean).length

  const inputClass = 'w-full rounded-2xl border border-boot-hairline bg-white px-4 py-3.5 text-sm font-bold text-boot-ink outline-none transition placeholder:text-boot-muted/70 focus:border-boot-primary disabled:opacity-50'
  const cardOff = 'border-boot-hairline bg-white text-boot-body hover:border-boot-primary/35 hover:bg-boot-soft/60'
  const cardOn = 'border-boot-primary bg-boot-soft text-boot-primary shadow-sm'

  const handleSubmit = useCallback(function handleSubmit() {
    const trimmedName = displayName.trim()
    const normalizedPhone = normalizePhone(phone)
    if (!trimmedName) {
      setError('친구에게 보여줄 이름을 입력해 주세요.')
      return
    }
    if (trimmedName.length < 2 || trimmedName.length > 20) {
      setError('이름은 2~20자 사이로 입력해 주세요.')
      return
    }
    if (!normalizedPhone) {
      setError('휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.')
      return
    }
    if (!gender) {
      setError('성별을 선택해 주세요.')
      return
    }
    const ageNum = parseInt(age, 10)
    if (!age || Number.isNaN(ageNum) || ageNum < 18 || ageNum > 35) {
      setError('나이를 올바르게 입력해 주세요. (18~35)')
      return
    }
    if (height) {
      const h = parseInt(height, 10)
      if (Number.isNaN(h) || h < 100 || h > 250) {
        setError('키를 올바르게 입력해 주세요. (100~250cm)')
        return
      }
    }
    if (!school.trim()) {
      setError('학교를 입력해 주세요.')
      return
    }

    setError(null)
    onSubmit({
      display_name: trimmedName,
      phone: normalizedPhone,
      gender,
      age: ageNum,
      height: height ? parseInt(height, 10) : null,
      body_type: bodyType,
      hair_density: gender === 'male' ? hairDensity : null,
      school: school.trim(),
      department: department.trim() || null,
      year,
    })
  }, [displayName, phone, gender, age, height, bodyType, hairDensity, school, department, year, onSubmit])

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

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border border-boot-primary/20 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-boot-ink">필수 입력 {requiredDone}/5</p>
            <p className="mt-1 text-xs text-boot-muted">이름, 성별, 나이, 휴대폰, 학교만 채우면 다음으로 넘어갈 수 있어요.</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <CheckCircle2 size={22} />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-boot-soft">
          <div
            className="h-full rounded-full bg-boot-primary transition-all"
            style={{ width: `${(requiredDone / 5) * 100}%` }}
          />
        </div>
      </section>

      <label className="block">
        <span className="mb-3 block text-sm font-bold">
          이름 <span className="text-rose-500">*</span>
          <span className="ml-2 text-xs font-normal text-boot-muted">친구와 그룹원에게 보여져요</span>
        </span>
        <input
          type="text"
          placeholder="예: 충현"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={saving}
          maxLength={20}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-3 block text-sm font-bold">
          휴대폰 번호 <span className="text-rose-500">*</span>
          <span className="ml-2 text-xs font-normal text-boot-muted">친구 초대와 약속 연락에 사용돼요</span>
        </span>
        <div className="relative">
          <Phone size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-boot-muted" />
          <input
            type="tel"
            inputMode="tel"
            placeholder="010-1234-5678"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            disabled={saving}
            maxLength={13}
            className={`${inputClass} pl-11`}
          />
        </div>
      </label>

      <div>
        <label className="mb-3 block text-sm font-bold">
          성별 <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {GENDER_OPTIONS.map((item) => {
            const selected = gender === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setGender(item.key)}
                className={`min-h-[118px] rounded-2xl border px-3 py-4 text-center transition ${selected ? cardOn : cardOff}`}
              >
                <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <UserRound size={24} className={selected ? 'text-boot-primary' : 'text-boot-muted'} />
                </span>
                <span className="block text-sm font-black">{item.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-boot-muted">{item.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-3 block text-sm font-bold">
            나이 <span className="text-rose-500">*</span>
          </span>
          <input
            type="number"
            placeholder="22"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            disabled={saving}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-3 block text-sm font-bold">
            키 <span className="text-xs font-normal text-boot-muted">(선택)</span>
          </span>
          <div className="relative">
            <Ruler size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-boot-muted" />
            <input
              type="number"
              placeholder="173"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              disabled={saving}
              className={`${inputClass} pl-10 pr-10`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-boot-muted">cm</span>
          </div>
        </label>
      </div>

      <div>
        <label className="mb-3 block text-sm font-bold">
          체형 <span className="text-xs font-normal text-boot-muted">(선택)</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {BODY_TYPES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setBodyType(bodyType === item.key ? null : item.key)}
              className={`min-h-[72px] rounded-2xl border px-2 py-2 text-center transition ${
                bodyType === item.key ? cardOn : cardOff
              }`}
            >
              <span className="block text-xs font-black">{item.label}</span>
              <span className="mt-1 block text-[10px] leading-3 text-boot-muted">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      {gender === 'male' && (
        <div>
          <label className="mb-3 block text-sm font-bold">
            머리숱 <span className="text-xs font-normal text-boot-muted">(선택)</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {HAIR_DENSITIES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setHairDensity(hairDensity === item.key ? null : item.key)}
                className={`min-h-[72px] rounded-2xl border px-2 py-2 text-center transition ${
                  hairDensity === item.key ? cardOn : cardOff
                }`}
              >
                <span className="block text-xs font-black">{item.label}</span>
                <span className="mt-1 block text-[10px] leading-3 text-boot-muted">{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="mb-3 block text-sm font-bold">
          학교 <span className="text-rose-500">*</span>
        </span>
        <div className="relative">
          <GraduationCap size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-boot-muted" />
          <input
            type="text"
            placeholder="부산대학교"
            value={school}
            onChange={(event) => setSchool(event.target.value)}
            disabled={saving}
            className={`${inputClass} pl-11`}
          />
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-3 block text-sm font-bold">
            학과 <span className="text-xs font-normal text-boot-muted">(선택)</span>
          </label>
          <div ref={deptRef} className="relative">
            <input
              type="text"
              placeholder="컴퓨터공학과"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value)
                setDeptSuggestions(searchDepartments(event.target.value))
              }}
              onBlur={() => setTimeout(() => setDeptSuggestions([]), 150)}
              disabled={saving}
              className={inputClass}
            />
            {deptSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-boot-hairline bg-white shadow-lg">
                {deptSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={() => {
                      setDepartment(suggestion)
                      setDeptSuggestions([])
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-boot-ink transition-colors hover:bg-boot-soft"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="mb-3 block text-sm font-bold">
            학년 <span className="text-xs font-normal text-boot-muted">(선택)</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setYear(year === item ? null : item)}
                className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                  year === item ? cardOn : cardOff
                }`}
              >
                {item}학년
              </button>
            ))}
          </div>
        </div>
      </div>

      {(error || serverError) && (
        <p className="text-center text-xs text-red-500">{error || serverError}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="btn-gradient w-full rounded-2xl py-4 text-base font-bold shadow-lg shadow-violet-900/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? '저장 중...' : '저장하고 이상형 월드컵으로'}
      </button>
    </div>
  )
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (!/^010\d{8}$/.test(digits)) return ''
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function formatPhoneInput(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}
