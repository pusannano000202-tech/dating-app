'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronLeft, ClipboardList, GraduationCap, Loader2, Phone, Ruler, UserRound } from 'lucide-react'
import type { BodyType, Gender, HairDensity } from '@/lib/types'
import {
  SCHOOL_THEMES,
  SORTED_SCHOOL_THEMES,
  persistSchoolTheme,
  readStoredSchoolTheme,
  resolveSchoolTheme,
  type SchoolTheme,
} from '@/lib/school-theme'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import {
  resolveDepartmentValidationForSchoolChange,
  resolveHydrationSafeInitialProfileSchool,
  resolveInitialProfileSchool,
  type DepartmentPickerValidationState,
} from '@/lib/profile/department-catalog'
import DepartmentPicker from '@/components/profile/DepartmentPicker'

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

export interface BasicInfoFormProps {
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

const STEPS = [
  { title: '친구에게 보일 이름부터 알려주세요', caption: '그룹과 매칭에서 사용할 이름이에요.' },
  { title: '매칭 기준을 맞춰볼게요', caption: '필수 정보만 받고, 선택 정보는 건너뛸 수 있어요.' },
  { title: '내 모습을 가볍게 알려주세요', caption: '원할 때만 선택해도 괜찮아요.' },
  { title: '어느 캠퍼스를 다니나요?', caption: '학교에 맞는 커뮤니티와 모임을 먼저 보여드려요.' },
  { title: '학과와 학년은 선택이에요', caption: '프로필을 더 잘 맞추고 싶을 때만 알려주세요.' },
  { title: '답변을 확인해 주세요', caption: '수정이 필요하면 원하는 질문으로 바로 돌아갈 수 있어요.' },
] as const

function persistFormSchoolTheme(theme: SchoolTheme): void {
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    if (url.searchParams.has('school') || url.searchParams.has('theme')) {
      url.searchParams.set('school', theme.id)
      url.searchParams.delete('theme')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  persistSchoolTheme(theme)
}

function resolveInitialFormSchool(profileSchool?: string): string {
  let routeSchool: string | undefined
  let isDevPreview = false

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const routeTheme = resolveSchoolTheme(params.get('school') ?? params.get('theme'))
    routeSchool = routeTheme?.name
    isDevPreview = isDevPreviewClientSession()
  }

  return resolveInitialProfileSchool({
    profileSchool,
    routeSchool,
    storedSchool: readStoredSchoolTheme().name,
    isDevPreview,
  })
}

export default function BasicInfoForm({ initialValue, onSubmit, saving = false, serverError }: BasicInfoFormProps) {
  const hydrationSafeInitialSchool = resolveHydrationSafeInitialProfileSchool({
    profileSchool: initialValue?.school,
    defaultSchool: SCHOOL_THEMES[0].name,
  })
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(initialValue?.display_name ?? '')
  const [nicknameCheck, setNicknameCheck] = useState<{ value: string; available: boolean; message: string } | null>(null)
  const [checkingNickname, setCheckingNickname] = useState(false)
  const [phone, setPhone] = useState(initialValue?.phone ?? '')
  const [gender, setGender] = useState<Gender | null>(initialValue?.gender ?? null)
  const [age, setAge] = useState(initialValue?.age?.toString() ?? '')
  const [height, setHeight] = useState(initialValue?.height?.toString() ?? '')
  const [bodyType, setBodyType] = useState<BodyType | null>(initialValue?.body_type ?? null)
  const [hairDensity, setHairDensity] = useState<HairDensity | null>(initialValue?.hair_density ?? null)
  const [school, setSchool] = useState(hydrationSafeInitialSchool)
  const [department, setDepartment] = useState(initialValue?.department ?? '')
  const [departmentValidationState, setDepartmentValidationState] =
    useState<DepartmentPickerValidationState>(initialValue?.department ? 'loading' : 'ready')
  const [schoolRestoreComplete, setSchoolRestoreComplete] = useState(false)
  const [year, setYear] = useState<number | null>(initialValue?.year ?? null)
  const [error, setError] = useState<string | null>(null)

  const inputClass = 'min-h-11 w-full rounded-lg border border-boot-hairline bg-white px-3 py-2.5 text-sm font-bold text-boot-ink outline-none transition focus:border-boot-primary focus:ring-2 focus:ring-boot-primary/15 disabled:opacity-50'
  const optionOff = 'border-boot-hairline bg-white text-boot-ink hover:border-boot-primary/45'
  const optionOn = 'border-boot-primary bg-boot-soft text-boot-primary'
  const selectedSchoolTheme = resolveSchoolTheme(school)
  const currentStep = STEPS[step]

  const changeSchool = useCallback((nextSchool: string) => {
    setDepartmentValidationState((currentState) =>
      resolveDepartmentValidationForSchoolChange({
        currentSchoolId: selectedSchoolTheme?.id ?? '',
        nextSchoolId: resolveSchoolTheme(nextSchool)?.id ?? '',
        department,
        currentState,
      }),
    )
    setSchool(nextSchool)
  }, [department, selectedSchoolTheme?.id])

  const applySchoolThemeIfKnown = useCallback((nextSchool: string) => {
    const theme = resolveSchoolTheme(nextSchool)
    if (theme) persistFormSchoolTheme(theme)
  }, [])

  useEffect(() => {
    const restoredSchool = resolveInitialFormSchool(initialValue?.school)
    if (restoredSchool !== hydrationSafeInitialSchool) {
      setDepartmentValidationState((currentState) =>
        resolveDepartmentValidationForSchoolChange({
          currentSchoolId: resolveSchoolTheme(hydrationSafeInitialSchool)?.id ?? '',
          nextSchoolId: resolveSchoolTheme(restoredSchool)?.id ?? '',
          department: initialValue?.department ?? '',
          currentState,
        }),
      )
      setSchool(restoredSchool)
    }
    setSchoolRestoreComplete(true)
  }, [hydrationSafeInitialSchool, initialValue?.department, initialValue?.school])

  useEffect(() => {
    if (!schoolRestoreComplete) return
    applySchoolThemeIfKnown(school)
  }, [applySchoolThemeIfKnown, school, schoolRestoreComplete])

  const checkNicknameAvailability = useCallback(async (value = displayName.trim()): Promise<boolean> => {
    const trimmedName = value.trim()
    if (trimmedName.length < 2 || trimmedName.length > 20) {
      setNicknameCheck(null)
      setError('닉네임은 2~20자 사이로 입력해 주세요.')
      return false
    }

    setCheckingNickname(true)
    setError(null)
    try {
      const res = await fetch(`/api/profiles/check-nickname?nickname=${encodeURIComponent(trimmedName)}`)
      if (!res.ok) {
        setNicknameCheck({ value: trimmedName, available: false, message: '중복 확인 DB 적용이 아직 필요해요.' })
        return false
      }
      const data = await res.json() as { available?: boolean }
      const available = Boolean(data.available)
      setNicknameCheck({
        value: trimmedName,
        available,
        message: available ? '사용 가능한 닉네임이에요.' : '이미 사용 중인 닉네임이에요.',
      })
      if (!available) setError('다른 닉네임을 입력해 주세요.')
      return available
    } catch {
      setNicknameCheck({ value: trimmedName, available: false, message: '중복 확인을 잠시 할 수 없어요.' })
      return false
    } finally {
      setCheckingNickname(false)
    }
  }, [displayName])

  const validateStep = useCallback((targetStep: number): boolean => {
    if (targetStep === 0) {
      if (displayName.trim().length < 2 || displayName.trim().length > 20) {
        setError('친구에게 보일 이름을 2~20자로 입력해 주세요.')
        return false
      }
      if (!normalizePhone(phone)) {
        setError('휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.')
        return false
      }
    }
    if (targetStep === 1) {
      const ageNumber = Number.parseInt(age, 10)
      if (!gender) {
        setError('성별을 선택해 주세요.')
        return false
      }
      if (!age || Number.isNaN(ageNumber) || ageNumber < 18 || ageNumber > 35) {
        setError('나이를 18~35 사이로 입력해 주세요.')
        return false
      }
      if (height) {
        const heightNumber = Number.parseInt(height, 10)
        if (Number.isNaN(heightNumber) || heightNumber < 100 || heightNumber > 250) {
          setError('키를 100~250cm 사이로 입력해 주세요.')
          return false
        }
      }
    }
    if (targetStep === 3 && !school.trim()) {
      setError('학교를 입력하거나 학교 목록에서 선택해 주세요.')
      return false
    }
    if (targetStep === 4 && departmentValidationState !== 'ready') {
      setError(
        departmentValidationState === 'loading'
          ? '학과 목록을 확인하고 있어요. 잠시만 기다려 주세요.'
          : '학교와 학과가 맞는지 확인한 뒤 학과 비우기를 선택해 주세요.',
      )
      return false
    }
    setError(null)
    return true
  }, [age, departmentValidationState, displayName, gender, height, phone, school])

  const handleSubmit = useCallback(async () => {
    const trimmedName = displayName.trim()
    const normalizedPhone = normalizePhone(phone)
    for (const requiredStep of [0, 1, 3, 4]) {
      if (!validateStep(requiredStep)) {
        setStep(requiredStep)
        return
      }
    }
    const ageNumber = Number.parseInt(age, 10)
    const nicknameReady = nicknameCheck?.value === trimmedName && nicknameCheck.available
    if (!nicknameReady && !(await checkNicknameAvailability(trimmedName))) {
      setStep(0)
      return
    }

    onSubmit({
      display_name: trimmedName,
      phone: normalizedPhone,
      gender: gender as Gender,
      age: ageNumber,
      height: height ? Number.parseInt(height, 10) : null,
      body_type: bodyType,
      hair_density: gender === 'male' ? hairDensity : null,
      school: school.trim(),
      department: department.trim() || null,
      year,
    })
  }, [age, bodyType, checkNicknameAvailability, department, displayName, gender, hairDensity, height, nicknameCheck, onSubmit, phone, school, validateStep, year])

  const summaryRows = useMemo(() => [
    ['닉네임', displayName || '미입력', 0],
    ['연락처', phone || '미입력', 0],
    ['기본 정보', [gender === 'male' ? '남자' : gender === 'female' ? '여자' : '미선택', age ? `${age}세` : '나이 미입력', height ? `${height}cm` : null].filter(Boolean).join(' · '), 1],
    ['선택 정보', [bodyType ? BODY_TYPES.find((item) => item.key === bodyType)?.label : null, gender === 'male' && hairDensity ? HAIR_DENSITIES.find((item) => item.key === hairDensity)?.label : null].filter(Boolean).join(' · ') || '건너뜀', 2],
    ['학교', school || '미입력', 3],
    ['학과 / 학년', [department || null, year ? `${year}학년` : null].filter(Boolean).join(' · ') || '건너뜀', 4],
  ], [age, bodyType, department, displayName, gender, hairDensity, height, phone, school, year])

  function moveNext() {
    if (!validateStep(step)) return
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function goToOverview() {
    setError(null)
    setStep(STEPS.length - 1)
  }

  return (
    <section aria-labelledby="basic-info-conversation-title" className="flex flex-col gap-5">
      <header className="border-b border-boot-hairline pb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black text-boot-primary">기본 정보</p>
          <span className="text-xs font-bold text-boot-muted">{step + 1} / {STEPS.length}</span>
        </div>
        <progress
          aria-label="기본정보 진행률"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          value={step + 1}
          max={STEPS.length}
          className="mt-3 h-2 w-full accent-boot-primary"
        />
        <h2 id="basic-info-conversation-title" className="mt-5 text-xl font-black text-boot-ink">{currentStep.title}</h2>
        <p className="mt-2 text-sm leading-6 text-boot-muted">{currentStep.caption}</p>
      </header>

      {step === 0 && (
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-boot-ink">닉네임 <span className="text-rose-600">*</span></span>
            <div className="flex gap-2">
              <input type="text" placeholder="예: 충현" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setNicknameCheck(null) }} disabled={saving} maxLength={20} className={inputClass} />
              <button type="button" onClick={() => { void checkNicknameAvailability() }} disabled={saving || checkingNickname || displayName.trim().length < 2} className="min-h-11 shrink-0 rounded-lg border border-boot-primary/35 px-3 text-xs font-black text-boot-primary disabled:opacity-40">
                {checkingNickname ? <Loader2 size={16} className="animate-spin" /> : '중복 확인'}
              </button>
            </div>
            {nicknameCheck && <p className={`mt-2 text-xs font-bold ${nicknameCheck.available ? 'text-emerald-700' : 'text-rose-700'}`}>{nicknameCheck.message}</p>}
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-boot-ink">휴대폰 번호 <span className="text-rose-600">*</span></span>
            <div className="relative"><Phone size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-boot-muted" /><input type="tel" inputMode="tel" placeholder="010-1234-5678" value={phone} onChange={(event) => setPhone(formatPhoneInput(event.target.value))} disabled={saving} maxLength={13} className={`${inputClass} pl-10`} /></div>
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div><p className="mb-2 text-sm font-black text-boot-ink">성별 <span className="text-rose-600">*</span></p><div className="grid grid-cols-2 gap-2">{GENDER_OPTIONS.map((item) => <button key={item.key} type="button" onClick={() => setGender(item.key)} className={`min-h-24 rounded-lg border p-3 text-left ${gender === item.key ? optionOn : optionOff}`}><UserRound size={19} /><span className="mt-3 block text-sm font-black">{item.label}</span><span className="mt-1 block text-xs text-boot-muted">{item.description}</span></button>)}</div></div>
          <div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-black text-boot-ink">나이 <span className="text-rose-600">*</span></span><input type="number" inputMode="numeric" placeholder="22" value={age} onChange={(event) => setAge(event.target.value)} disabled={saving} className={inputClass} /></label><label><span className="mb-2 block text-sm font-black text-boot-ink">키 <span className="font-normal text-boot-muted">선택</span></span><div className="relative"><Ruler size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-boot-muted" /><input type="number" inputMode="numeric" placeholder="173" value={height} onChange={(event) => setHeight(event.target.value)} disabled={saving} className={`${inputClass} pl-9 pr-9`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-boot-muted">cm</span></div></label></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div><p className="mb-2 text-sm font-black text-boot-ink">체형 <span className="font-normal text-boot-muted">선택</span></p><div className="grid grid-cols-2 gap-2">{BODY_TYPES.map((item) => <button key={item.key} type="button" onClick={() => setBodyType(bodyType === item.key ? null : item.key)} className={`min-h-[72px] rounded-lg border p-3 text-left ${bodyType === item.key ? optionOn : optionOff}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-1 block text-xs text-boot-muted">{item.description}</span></button>)}</div></div>
          {gender === 'male' && <div><p className="mb-2 text-sm font-black text-boot-ink">머리숱 <span className="font-normal text-boot-muted">선택</span></p><div className="grid grid-cols-3 gap-2">{HAIR_DENSITIES.map((item) => <button key={item.key} type="button" onClick={() => setHairDensity(hairDensity === item.key ? null : item.key)} className={`min-h-[72px] rounded-lg border p-3 text-center ${hairDensity === item.key ? optionOn : optionOff}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-1 block text-[11px] text-boot-muted">{item.description}</span></button>)}</div></div>}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-black text-boot-ink">학교 <span className="text-rose-600">*</span></span><div className="relative"><GraduationCap size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-boot-muted" /><input type="text" placeholder="부산대학교" value={school} onChange={(event) => changeSchool(event.target.value)} disabled={saving} className={`${inputClass} pl-10`} /></div></label><div><p className="mb-2 text-sm font-black text-boot-ink">빠른 선택</p><div className="grid grid-cols-3 gap-2">{SORTED_SCHOOL_THEMES.map((theme) => <button key={theme.id} type="button" onClick={() => { changeSchool(theme.name); persistFormSchoolTheme(theme) }} disabled={saving} className={`min-h-11 rounded-lg border px-2 text-xs font-black ${selectedSchoolTheme?.id === theme.id ? optionOn : optionOff}`}>{theme.shortName}</button>)}</div></div></div>
      )}

      {step === 4 && (
        <div className="space-y-5"><div><label className="mb-2 block text-sm font-black text-boot-ink">학과 <span className="font-normal text-boot-muted">선택</span></label><fieldset disabled={saving} className="min-w-0 border-0 p-0"><DepartmentPicker schoolId={selectedSchoolTheme?.id ?? ''} value={department} onChange={setDepartment} allowCustomEntry={true} onValidationChange={setDepartmentValidationState} /></fieldset></div><div><p className="mb-2 text-sm font-black text-boot-ink">학년 <span className="font-normal text-boot-muted">선택</span></p><div className="grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 6].map((item) => <button key={item} type="button" onClick={() => setYear(year === item ? null : item)} className={`min-h-11 rounded-lg border text-sm font-black ${year === item ? optionOn : optionOff}`}>{item}학년</button>)}</div></div></div>
      )}

      {step === 5 && (
        <div className="divide-y divide-boot-hairline border-y border-boot-hairline">{summaryRows.map(([label, value, targetStep]) => <button key={String(label)} type="button" onClick={() => setStep(targetStep as number)} className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left"><span className="text-xs font-bold text-boot-muted">{label}</span><span className="min-w-0 flex-1 truncate text-right text-sm font-black text-boot-ink">{value}</span><ArrowRight size={16} className="shrink-0 text-boot-primary" /></button>)}</div>
      )}

      {(error || serverError) && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">{error || serverError}</p>}

      <footer className="flex flex-col gap-3 border-t border-boot-hairline pt-4">
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || saving} className="min-h-11 rounded-lg border border-boot-hairline px-3 text-sm font-black text-boot-ink disabled:opacity-40"><ChevronLeft size={17} className="mr-1 inline-block" />이전 질문</button><button type="button" onClick={goToOverview} disabled={saving} className="min-h-11 rounded-lg border border-boot-primary/35 px-3 text-sm font-black text-boot-primary"><ClipboardList size={16} className="mr-1 inline-block" />전체 답변 보기</button></div>
        {step < STEPS.length - 1 ? <button type="button" onClick={moveNext} disabled={saving} className="min-h-12 rounded-lg bg-boot-primary px-4 text-base font-black text-white disabled:opacity-50">다음 질문 <ArrowRight size={18} className="ml-1 inline-block" /></button> : <button type="button" onClick={() => { void handleSubmit() }} disabled={saving || checkingNickname || departmentValidationState !== 'ready'} className="min-h-12 rounded-lg bg-boot-primary px-4 text-base font-black text-white disabled:opacity-50">{saving ? '저장 중...' : checkingNickname ? '닉네임 확인 중...' : departmentValidationState === 'loading' ? '학과 목록 확인 중...' : departmentValidationState === 'confirmation-required' ? '학교와 학과를 확인해 주세요' : '저장하고 이상형 월드컵으로'}</button>}
      </footer>
    </section>
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
