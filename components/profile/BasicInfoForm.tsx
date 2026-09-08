'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ClipboardList, GraduationCap, Loader2, Minus, Plus, RefreshCw, UserRound } from 'lucide-react'
import DepartmentPicker from '@/components/profile/DepartmentPicker'
import PhoneVerificationPanel from '@/components/profile/PhoneVerificationPanel'
import type { DepartmentPickerValidationState } from '@/lib/profile/department-catalog'
import type { CommunityGender } from '@/lib/profile/eligibility'
import { PILOT_SIGNUP_SCHOOL_THEMES, resolveSchoolTheme } from '@/lib/school-theme'
import type { BodyType, HairDensity } from '@/lib/types'
import { parseFriendRecognitionName } from '@/lib/friends/recognition-name'

export interface BasicInfoData {
  display_name: string
  friend_recognition_name: string
  alias_ticket: string
  phone_verified: boolean
  gender: CommunityGender
  birth_date: string
  height: number | null
  body_type: BodyType | null
  hair_density: HairDensity | null
  school_scope: 'pnu_self_selected'
  department: string
  year: number | null
}

export interface BasicInfoFormProps {
  initialValue?: Partial<BasicInfoData>
  onSubmit: (data: BasicInfoData) => void | Promise<void>
  saving?: boolean
  serverError?: string | null
}

const BODY_TYPES: { key: BodyType; label: string }[] = [
  { key: 'slim', label: '슬림' }, { key: 'average', label: '보통' },
  { key: 'athletic', label: '운동형' }, { key: 'chubby', label: '통통' },
]
const HAIR_DENSITIES: { key: HairDensity; label: string }[] = [
  { key: 'full', label: '풍성' }, { key: 'thinning', label: '보통' }, { key: 'bald', label: '없음' },
]
const GENDER_OPTIONS: { key: CommunityGender; label: string; description: string }[] = [
  { key: 'male', label: '남자', description: '커뮤니티와 매칭 참여 가능' },
  { key: 'female', label: '여자', description: '커뮤니티와 매칭 참여 가능' },
  { key: 'other', label: '기타', description: '커뮤니티 참여 가능' },
  { key: 'prefer_not_to_say', label: '응답 안 함', description: '커뮤니티 참여 가능' },
  { key: 'unknown', label: '모름', description: '커뮤니티 참여 가능' },
]
const STEPS = [
  { title: '휴대폰을 확인해 주세요', caption: '실명이나 번호는 프로필에 공개되지 않아요.' },
  { title: '친구가 알아볼 이름을 입력해 주세요', caption: '친구 초대와 수락한 친구에게만 보이며 전체 커뮤니티에는 공개되지 않아요.' },
  { title: '친구들에게 보일 이름을 골라주세요', caption: '서버가 만든 별칭 중 하나만 선택할 수 있어요.' },
  { title: '가입 기준을 확인할게요', caption: '생년월일은 나이 확인에만 쓰고 공개하지 않아요.' },
  { title: '부산대 구성원인가요?', caption: '현재는 부산대학교 학생이 직접 확인하고 가입하는 파일럿이에요.' },
  { title: '학과를 알려주세요', caption: '학과는 필수이고 나머지는 선택할 수 있어요.' },
  { title: '가입 정보를 확인해 주세요', caption: '여기까지 저장하면 커뮤니티를 바로 둘러볼 수 있어요.' },
] as const

export default function BasicInfoForm({ initialValue, onSubmit, saving = false, serverError }: BasicInfoFormProps) {
  const [step, setStep] = useState(0)
  const [phoneVerified, setPhoneVerified] = useState(Boolean(initialValue?.phone_verified))
  const [friendRecognitionName, setFriendRecognitionName] = useState(initialValue?.friend_recognition_name ?? '')
  const [aliasOptions, setAliasOptions] = useState<string[]>([])
  const [aliasTicket, setAliasTicket] = useState('')
  const [displayName, setDisplayName] = useState(initialValue?.display_name ?? '')
  const [aliasLoading, setAliasLoading] = useState(false)
  const [gender, setGender] = useState<CommunityGender | null>(initialValue?.gender ?? null)
  const initialBirth = parseBirthDate(initialValue?.birth_date)
  const [birthYear, setBirthYear] = useState<number | null>(initialBirth?.year ?? null)
  const [birthMonth, setBirthMonth] = useState<number | null>(initialBirth?.month ?? null)
  const [birthDay, setBirthDay] = useState<number | null>(initialBirth?.day ?? null)
  const [schoolSelected, setSchoolSelected] = useState(initialValue?.school_scope === 'pnu_self_selected')
  const [department, setDepartment] = useState(initialValue?.department ?? '')
  const [departmentValidationState, setDepartmentValidationState] = useState<DepartmentPickerValidationState>(initialValue?.department ? 'loading' : 'ready')
  const [height, setHeight] = useState(initialValue?.height?.toString() ?? '')
  const [bodyType, setBodyType] = useState<BodyType | null>(initialValue?.body_type ?? null)
  const [hairDensity, setHairDensity] = useState<HairDensity | null>(initialValue?.hair_density ?? null)
  const [year, setYear] = useState<number | null>(initialValue?.year ?? null)
  const [error, setError] = useState<string | null>(null)
  const schoolTheme = resolveSchoolTheme(PILOT_SIGNUP_SCHOOL_THEMES[0].id)
  const currentStep = STEPS[step]
  const optionOff = 'border-boot-hairline bg-white text-boot-ink hover:border-boot-primary/45'
  const optionOn = 'border-boot-primary bg-boot-soft text-boot-primary ring-1 ring-boot-primary/15'

  const loadAliasOptions = useCallback(async () => {
    setAliasLoading(true); setError(null)
    try {
      const response = await fetch('/api/profile/alias-options', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { options?: unknown; ticket?: unknown }
      if (!response.ok || !Array.isArray(payload.options) || typeof payload.ticket !== 'string') {
        setError('별칭을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return
      }
      const options = payload.options.filter((item): item is string => typeof item === 'string')
      setAliasOptions(options); setAliasTicket(payload.ticket)
      setDisplayName((current) => options.includes(current) ? current : '')
    } catch { setError('별칭을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.') }
    finally { setAliasLoading(false) }
  }, [])
  useEffect(() => { void loadAliasOptions() }, [loadAliasOptions])

  const birthDate = birthYear && birthMonth && birthDay ? `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}` : ''
  const age = birthDate ? ageOnKoreaToday(birthDate) : null
  const currentKoreaYear = koreaToday().year

  const validateStep = useCallback((target: number) => {
    if (target === 0 && !phoneVerified) return fail('휴대폰 인증을 먼저 완료해 주세요.')
    if (target === 1 && !parseFriendRecognitionName(friendRecognitionName)) return fail('친구가 알아볼 이름을 2~40자로 입력해 주세요.')
    if (target === 2 && (!displayName || !aliasTicket || !aliasOptions.includes(displayName))) return fail('서버가 제안한 별칭을 하나 골라주세요.')
    if (target === 3) {
      if (!gender) return fail('성별 항목을 하나 선택해 주세요.')
      if (age == null || age < 19 || age > 35) return fail('가입할 수 있는 나이는 만 19~35세예요.')
    }
    if (target === 4 && !schoolSelected) return fail('부산대학교 구성원임을 직접 확인해 주세요.')
    if (target === 5) {
      if (!department.trim()) return fail('학과를 선택하거나 직접 입력해 주세요.')
      if (departmentValidationState !== 'ready') return fail(departmentValidationState === 'loading' ? '학과 목록을 확인하고 있어요.' : '학교와 학과를 다시 확인해 주세요.')
      if (height) { const value = Number(height); if (!Number.isInteger(value) || value < 100 || value > 250) return fail('키는 100~250cm 사이로 입력해 주세요.') }
    }
    setError(null); return true
  }, [age, aliasOptions, aliasTicket, department, departmentValidationState, displayName, friendRecognitionName, gender, height, phoneVerified, schoolSelected])

  function fail(message: string) { setError(message); return false }
  function moveNext() { if (validateStep(step)) setStep((current) => Math.min(current + 1, STEPS.length - 1)) }
  async function submit() {
    for (const requiredStep of [0, 1, 2, 3, 4, 5]) if (!validateStep(requiredStep)) { setStep(requiredStep); return }
    await onSubmit({ display_name: displayName, friend_recognition_name: parseFriendRecognitionName(friendRecognitionName) as string, alias_ticket: aliasTicket, phone_verified: true, gender: gender as CommunityGender, birth_date: birthDate, height: height ? Number(height) : null, body_type: bodyType, hair_density: gender === 'male' ? hairDensity : null, school_scope: 'pnu_self_selected', department: department.trim(), year })
  }

  const summaryRows = useMemo(() => [
    ['휴대폰', phoneVerified ? '인증 완료' : '미인증', 0],
    ['친구 인식명', friendRecognitionName || '미입력', 1],
    ['별칭', displayName || '미선택', 2],
    ['가입 정보', `${genderLabel(gender)} · ${birthDate || '생년월일 미선택'}${age == null ? '' : ` · 만 ${age}세`}`, 3],
    ['학교', schoolSelected ? '부산대학교 · 직접 선택' : '미선택', 4],
    ['학과 / 학년', [department || null, year ? `${year}학년` : null].filter(Boolean).join(' · ') || '미입력', 5],
  ], [age, birthDate, department, displayName, friendRecognitionName, gender, phoneVerified, schoolSelected, year])

  return <section aria-labelledby="basic-info-conversation-title" className="flex flex-col gap-5">
    <header className="border-b border-boot-hairline pb-4"><div className="flex items-center justify-between"><p className="text-xs font-black text-boot-primary">최소 가입</p><span className="text-xs font-bold text-boot-muted">{step + 1} / {STEPS.length}</span></div><progress aria-label="가입 진행률" value={step + 1} max={STEPS.length} className="mt-3 h-2 w-full accent-boot-primary" /><h2 id="basic-info-conversation-title" className="mt-5 text-xl font-black text-boot-ink">{currentStep.title}</h2><p className="mt-2 text-sm leading-6 text-boot-muted">{currentStep.caption}</p></header>

    {step === 0 && <PhoneVerificationPanel initiallyVerified={phoneVerified} onVerified={() => { setPhoneVerified(true); setError(null) }} />}
    {step === 1 && <div className="space-y-3"><label htmlFor="friend-recognition-name" className="block text-sm font-black">이름 <span className="text-rose-600">*</span></label><input id="friend-recognition-name" name="friend_recognition_name" type="text" autoComplete="name" maxLength={40} value={friendRecognitionName} onChange={(event) => { setFriendRecognitionName(event.target.value); setError(null) }} disabled={saving} placeholder="친구가 알아볼 이름" className="min-h-12 w-full rounded-xl border border-boot-hairline bg-white px-4 text-base font-bold outline-none focus:border-boot-primary" /><p className="rounded-lg bg-boot-soft px-3 py-2.5 text-xs font-bold leading-5 text-boot-muted">이 이름은 친구 초대와 수락한 친구에게만 보여요. 커뮤니티와 랜덤 상대에게는 공개 별칭만 보입니다.</p></div>}
    {step === 2 && <div className="space-y-3">{aliasLoading ? <div className="grid min-h-40 place-items-center rounded-xl bg-boot-soft"><Loader2 className="animate-spin text-boot-primary" /></div> : aliasOptions.map((alias) => <button key={alias} type="button" aria-label={`별칭 ${alias} 선택`} onClick={() => { setDisplayName(alias); setError(null) }} disabled={saving} className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left text-base font-black ${displayName === alias ? optionOn : optionOff}`}><span>{alias}</span>{displayName === alias && <Check size={18} />}</button>)}<button type="button" onClick={() => { void loadAliasOptions() }} disabled={aliasLoading || saving} className="min-h-11 w-full rounded-xl border border-boot-hairline text-sm font-black text-boot-primary disabled:opacity-50"><RefreshCw size={15} className="mr-1.5 inline" />다른 이름 보기</button><p className="rounded-lg bg-boot-soft px-3 py-2.5 text-xs font-bold leading-5 text-boot-muted">공개 별칭에는 이름·연락처 같은 개인정보가 섞이지 않게 했어요.</p></div>}
    {step === 3 && <div className="space-y-5"><div><p className="mb-2 text-sm font-black text-boot-ink">생년월일 <span className="text-rose-600">*</span></p><div className="grid grid-cols-3 gap-2"><DateButtonPicker label="년" value={birthYear} min={currentKoreaYear - 36} max={currentKoreaYear - 19} fallback={currentKoreaYear - 25} onChange={(value) => { setBirthYear(value); setBirthDay((day) => day == null ? day : Math.min(day, daysInMonth(value, birthMonth))) }} /><DateButtonPicker label="월" value={birthMonth} min={1} max={12} fallback={1} onChange={(value) => { setBirthMonth(value); setBirthDay((day) => day == null ? day : Math.min(day, daysInMonth(birthYear, value))) }} /><DateButtonPicker label="일" value={birthDay} min={1} max={daysInMonth(birthYear, birthMonth)} fallback={1} onChange={setBirthDay} /></div><p className="mt-2 text-xs font-bold text-boot-muted">비공개 · 가입 연령 확인에만 사용</p></div><div><p className="mb-2 text-sm font-black text-boot-ink">성별 <span className="text-rose-600">*</span></p><div className="grid grid-cols-2 gap-2">{GENDER_OPTIONS.map((item) => <button key={item.key} type="button" onClick={() => setGender(item.key)} className={`min-h-20 rounded-xl border p-3 text-left ${gender === item.key ? optionOn : optionOff}`}><UserRound size={17} /><span className="mt-2 block text-sm font-black">{item.label}</span><span className="mt-1 block text-[11px] font-bold text-boot-muted">{item.description}</span></button>)}</div></div>{gender && gender !== 'male' && gender !== 'female' && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold leading-5 text-amber-800">커뮤니티는 바로 이용할 수 있어요. 현재 1:1 매칭은 남자·여자 선택 이용자부터 지원해요.</p>}</div>}
    {step === 4 && <div className="space-y-4"><button type="button" onClick={() => setSchoolSelected((value) => !value)} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border p-4 text-left ${schoolSelected ? optionOn : optionOff}`}><GraduationCap size={22} /><span className="flex-1"><span className="block text-base font-black">부산대학교</span><span className="mt-1 block text-xs font-bold text-boot-muted">본인이 부산대 구성원이라면 눌러서 선택</span></span>{schoolSelected && <Check size={20} />}</button><p className="rounded-lg bg-boot-soft px-3 py-3 text-xs font-bold leading-5 text-boot-muted">학교 인증 마크가 아니라 본인의 직접 선택이에요. 다른 학교는 파일럿 이후 지원할 예정이에요.</p></div>}
    {step === 5 && <div className="space-y-5"><div><label className="mb-2 block text-sm font-black text-boot-ink">학과 <span className="text-rose-600">*</span></label><fieldset disabled={saving} className="border-0 p-0"><DepartmentPicker schoolId={schoolTheme?.id ?? 'pnu'} value={department} onChange={setDepartment} allowCustomEntry={true} onValidationChange={setDepartmentValidationState} /></fieldset><p className="mt-2 text-xs font-bold text-boot-muted">목록에 없으면 직접 입력하거나 고객지원에 알려주세요.</p></div><div><p className="mb-2 text-sm font-black text-boot-ink">학년 <span className="font-normal text-boot-muted">선택</span></p><div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6].map((item) => <button key={item} type="button" onClick={() => setYear(year === item ? null : item)} className={`min-h-11 rounded-lg border text-sm font-black ${year === item ? optionOn : optionOff}`}>{item}학년</button>)}</div></div><label className="block"><span className="mb-2 block text-sm font-black text-boot-ink">키 <span className="font-normal text-boot-muted">선택</span></span><input type="number" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} className="min-h-11 w-full rounded-lg border border-boot-hairline px-3 font-bold outline-none focus:border-boot-primary" /><span className="mt-1 block text-xs text-boot-muted">100~250cm</span></label><div><p className="mb-2 text-sm font-black text-boot-ink">체형 <span className="font-normal text-boot-muted">선택</span></p><div className="grid grid-cols-4 gap-2">{BODY_TYPES.map((item) => <button key={item.key} type="button" onClick={() => setBodyType(bodyType === item.key ? null : item.key)} className={`min-h-11 rounded-lg border text-xs font-black ${bodyType === item.key ? optionOn : optionOff}`}>{item.label}</button>)}</div></div>{gender === 'male' && <div><p className="mb-2 text-sm font-black text-boot-ink">머리숱 <span className="font-normal text-boot-muted">선택</span></p><div className="grid grid-cols-3 gap-2">{HAIR_DENSITIES.map((item) => <button key={item.key} type="button" onClick={() => setHairDensity(hairDensity === item.key ? null : item.key)} className={`min-h-11 rounded-lg border text-xs font-black ${hairDensity === item.key ? optionOn : optionOff}`}>{item.label}</button>)}</div></div>}</div>}
    {step === 6 && <div className="divide-y divide-boot-hairline border-y border-boot-hairline">{summaryRows.map(([label, value, target]) => <button key={String(label)} type="button" onClick={() => setStep(target as number)} className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left"><span className="text-xs font-bold text-boot-muted">{label}</span><span className="min-w-0 flex-1 truncate text-right text-sm font-black text-boot-ink">{value}</span><ArrowRight size={16} className="text-boot-primary" /></button>)}</div>}
    {(error || serverError) && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">{error || serverError}</p>}
    <footer className="flex flex-col gap-3 border-t border-boot-hairline pt-4"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving} className="min-h-11 rounded-lg border border-boot-hairline text-sm font-black disabled:opacity-40"><ChevronLeft size={16} className="mr-1 inline" />이전</button><button type="button" onClick={() => { setError(null); setStep(STEPS.length - 1) }} disabled={saving} className="min-h-11 rounded-lg border border-boot-primary/35 text-sm font-black text-boot-primary"><ClipboardList size={15} className="mr-1 inline" />전체 보기</button></div>{step < STEPS.length - 1 ? <button type="button" onClick={moveNext} disabled={saving} className="min-h-12 rounded-lg bg-boot-primary text-base font-black text-white disabled:opacity-50">다음 <ArrowRight size={17} className="ml-1 inline" /></button> : <button type="button" onClick={() => { void submit() }} disabled={saving || aliasLoading || departmentValidationState !== 'ready'} className="min-h-12 rounded-lg bg-boot-primary text-base font-black text-white disabled:opacity-50">{saving ? '가입 저장 중...' : '가입 정보 저장하기'}</button>}</footer>
  </section>
}

function DateButtonPicker({ label, value, min, max, fallback, onChange }: { label: string; value: number | null; min: number; max: number; fallback: number; onChange: (value: number) => void }) {
  const current = value ?? Math.min(max, Math.max(min, fallback))
  return <div className="rounded-xl border border-boot-hairline bg-white p-2 text-center"><span className="text-[11px] font-black text-boot-muted">{label}</span><div className="mt-1 flex items-center justify-between gap-1"><button type="button" aria-label={`${label} 이전`} onClick={() => onChange(current <= min ? max : current - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-boot-soft text-boot-primary"><Minus size={14} /></button><button type="button" aria-label={`${label} 선택`} onClick={() => onChange(current)} className="min-h-9 min-w-9 text-sm font-black text-boot-ink">{value ?? '선택'}</button><button type="button" aria-label={`${label} 다음`} onClick={() => onChange(current >= max ? min : current + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-boot-soft text-boot-primary"><Plus size={14} /></button></div></div>
}
function parseBirthDate(value?: string) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? ''); return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null }
function daysInMonth(year: number | null, month: number | null) { return new Date(Date.UTC(year ?? 2000, month ?? 1, 0)).getUTCDate() }
function ageOnKoreaToday(birthDate: string) {
  const parsed = parseBirthDate(birthDate); if (!parsed) return null
  const current = koreaToday()
  if (parsed.day > daysInMonth(parsed.year, parsed.month)) return null
  let age = current.year - parsed.year
  if (current.month < parsed.month || (current.month === parsed.month && current.day < parsed.day)) age -= 1
  return age
}
function koreaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const read = (type: 'year' | 'month' | 'day') => Number(parts.find((part) => part.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}
function genderLabel(value: CommunityGender | null) { return GENDER_OPTIONS.find((item) => item.key === value)?.label ?? '성별 미선택' }
