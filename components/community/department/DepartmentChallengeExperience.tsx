'use client'

import { ArrowLeft, CalendarDays, Check, ChevronDown, Gamepad2, Loader2, LockKeyhole, MapPin, Plus, Send, ShieldCheck, Trophy, UsersRound } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { parseDepartmentChallengeInviteState, type DepartmentChallengeInviteState } from '@/lib/community/challenges'
import {
  buildDepartmentRosterSlots,
  parseDepartmentChallenges,
  resolveCreatedChallengeRefresh,
  type DepartmentChallenge as Challenge,
  type DepartmentChallengeTeam as ChallengeTeam,
} from './department-challenge-presentation'
import styles from './department-challenge.module.css'

type MutationPayload = { error?: string; challenge?: unknown } | null
type MutationResult = {
  saved: boolean
  challenges: Challenge[] | null
  payload: MutationPayload
}
type Mutate = (
  path: string,
  body: Record<string, unknown>,
  method?: string,
) => Promise<MutationResult>

export default function DepartmentChallengeExperience() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [category, setCategory] = useState<'soccer' | 'gaming'>('gaming')
  const [title, setTitle] = useState('')
  const [rules, setRules] = useState('')
  const [capacity, setCapacity] = useState(5)
  const [createOpen, setCreateOpen] = useState(true)
  const [createHint, setCreateHint] = useState('')
  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null)
  const [createdRefreshPending, setCreatedRefreshPending] = useState(false)
  const createIdempotencyKeyRef = useRef<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await fetch('/api/community/department/challenges', { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as { challenges?: unknown; error?: string } | null
      const parsedChallenges = response.ok ? parseDepartmentChallenges(payload?.challenges) : null
      if (!parsedChallenges) throw new Error(payload?.error ?? 'load_failed')
      setChallenges(parsedChallenges)
      return parsedChallenges
    } catch {
      setChallenges([])
      setLoadError(true)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('category')
    if (requested === 'soccer' || requested === 'gaming') setCategory(requested)
  }, [])

  async function mutate(path: string, body: Record<string, unknown>, method = 'POST'): Promise<MutationResult> {
    if (busy) return { saved: false, challenges: null, payload: null }
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => null) as MutationPayload
      if (!response.ok) throw new Error(payload?.error ?? 'request_failed')
      const refreshedChallenges = await load()
      return { saved: true, challenges: refreshedChallenges, payload }
    } catch (error) {
      setNotice(challengeError(error))
      const refreshedChallenges = await load()
      return { saved: false, challenges: refreshedChallenges, payload: null }
    } finally {
      setBusy(false)
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const idempotencyKey = createIdempotencyKeyRef.current ?? crypto.randomUUID()
    createIdempotencyKeyRef.current = idempotencyKey
    const result = await mutate('/api/community/department/challenges', {
      category,
      title,
      rules,
      team_capacity: capacity,
      idempotency_key: idempotencyKey,
    })
    if (result.saved) {
      const createdId = parseDepartmentChallenges([result.payload?.challenge])?.[0]?.id ?? null
      const refreshStatus = resolveCreatedChallengeRefresh(createdId, result.challenges)
      setCreatedChallengeId(createdId)
      setCreatedRefreshPending(refreshStatus === 'needs_reload')
      setTitle('')
      setRules('')
      setCreateHint('')
      setCreateOpen(false)
      createIdempotencyKeyRef.current = null
      setNotice(refreshStatus === 'ready'
        ? '팀을 만들었어요. 아래 열린 패널에서 수락한 같은 학과 친구를 초대해 보세요.'
        : '팀은 만들어졌어요. 목록을 다시 불러오면 이 팀의 초대 패널을 열 수 있어요.')
    }
  }

  async function retryCreatedChallenge() {
    const refreshedChallenges = await load()
    const refreshStatus = resolveCreatedChallengeRefresh(createdChallengeId, refreshedChallenges)
    setCreatedRefreshPending(refreshStatus === 'needs_reload')
    setNotice(refreshStatus === 'ready'
      ? '새 팀을 확인했어요. 아래 친구 초대 패널을 열어 두었어요.'
      : '팀은 만들어졌어요. 목록을 다시 불러오면 이 팀의 초대 패널을 열 수 있어요.')
  }

  function resetCreateIntent() {
    createIdempotencyKeyRef.current = null
    setCreatedChallengeId(null)
    setCreatedRefreshPending(false)
  }

  function chooseCategory(nextCategory: 'soccer' | 'gaming') {
    setCategory(nextCategory)
    resetCreateIntent()
  }

  function explainPlannedSlot() {
    setCreateHint('팀 이름을 먼저 적고 팀을 만들면, 수락한 같은 학과 친구를 초대할 수 있어요.')
    titleInputRef.current?.focus()
  }

  const scene = category === 'gaming' ? {
    src: '/social-scenes/department-clubhouse-gaming.webp',
    alt: '대학생 친구들이 PC 게임을 함께 즐기며 웃는 학과 게임 팀 분위기',
    height: 800,
  } : {
    src: '/social-scenes/home-playmaker-football.webp',
    alt: '대학생 친구들이 캠퍼스 운동장에서 함께 축구하는 학과 팀 분위기',
    height: 535,
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <Link href="/meetups" aria-label="일반 모임으로 돌아가기" className={styles.backButton}><ArrowLeft aria-hidden="true" size={23} /></Link>
          <span>우리 팀 만들기</span>
        </header>

        {createOpen ? <form onSubmit={(event) => { void create(event) }} className={styles.composer}>
          <div className={styles.heroTitle}>
            <p>우리 과</p>
            <h1>PLAYMAKER</h1>
            <span>친구와 팀부터 만들고, 상대 학과와 한 판을 준비해요.</span>
          </div>

          <div className={styles.segmented} role="group" aria-label="종목 선택">
            <button type="button" aria-pressed={category === 'gaming'} onClick={() => chooseCategory('gaming')} className={category === 'gaming' ? styles.segmentActive : undefined}>게임</button>
            <button type="button" aria-pressed={category === 'soccer'} onClick={() => chooseCategory('soccer')} className={category === 'soccer' ? styles.segmentActive : undefined}>축구</button>
          </div>

          <section className={styles.rosterPreview} aria-labelledby="planned-roster-title">
            <div className={styles.rosterHeading}>
              <div>
                <h2 id="planned-roster-title">정원 슬롯</h2>
                <p>총 {capacity}자리 · 만들면 내가 첫 자리</p>
              </div>
              <span><LockKeyhole aria-hidden="true" size={14} />팀을 먼저 만든 뒤 수락한 친구만 합류해요</span>
            </div>
            <PlannedRoster capacity={capacity} onPlannedSlotClick={explainPlannedSlot} />
            {createHint ? <p role="status" className={styles.createHint}>{createHint}</p> : null}
            <label className={styles.capacityField}>
              <span><UsersRound aria-hidden="true" size={16} />팀 정원</span>
              <input
                aria-label="팀 정원"
                type="number"
                min={2}
                max={20}
                value={capacity}
                onChange={(event) => {
                  const nextCapacity = Number(event.target.value)
                  if (Number.isFinite(nextCapacity)) setCapacity(Math.min(20, Math.max(2, nextCapacity)))
                  resetCreateIntent()
                }}
              />
            </label>
          </section>

          <label className={styles.titleField}>
            <span>팀 이름</span>
            <input
              ref={titleInputRef}
              aria-label="모집 제목"
              required
              minLength={4}
              maxLength={80}
              value={title}
              onChange={(event) => { setTitle(event.target.value); resetCreateIntent() }}
              placeholder={category === 'soccer' ? '예: 기계공학과 플레이메이커' : '예: 기계공학과 게임 플레이메이커'}
            />
          </label>

          <details className={styles.rulesDisclosure}>
            <summary>{category === 'soccer' ? '경기 규칙·준비물 설정 (선택)' : '게임 종류·규칙 설정 (선택)'}<ChevronDown aria-hidden="true" size={19} /></summary>
            <label>
              <span className="sr-only">경기 규칙과 준비물</span>
              <textarea
                aria-label="경기 규칙과 준비물"
                maxLength={2000}
                value={rules}
                onChange={(event) => { setRules(event.target.value); resetCreateIntent() }}
                placeholder={category === 'soccer' ? '경기 시간과 준비물을 알려주세요.' : '게임 모드와 티어 제한이 있다면 알려주세요.'}
              />
            </label>
          </details>

          <figure className={styles.sceneFigure}>
            <Image
              src={scene.src}
              alt={scene.alt}
              width={1600}
              height={scene.height}
              sizes="(min-width: 900px) 790px, calc(100vw - 32px)"
              priority
            />
            <figcaption className="sr-only">팀원 프로필이 아닌 활동 분위기 이미지예요.</figcaption>
          </figure>

          <div className={styles.createActionBar}>
            <button type="submit" disabled={busy || title.trim().length < 4} className={styles.createButton}>
              {busy ? <><Loader2 aria-hidden="true" className="animate-spin" size={19} />팀 만드는 중</> : '팀 만들고 친구 초대하기'}
            </button>
          </div>
          <p className={styles.identityNote}>학과는 가입 때 직접 입력한 정보이며 재학 인증 표시가 아니에요.</p>
        </form> : <section className={styles.createdPanel}>
          <p>{createdRefreshPending ? '팀은 생성됐고, 친구 초대 목록만 다시 확인하면 돼요.' : '새 팀의 친구 초대 패널을 열었어요.'}</p>
          {createdRefreshPending
            ? <button type="button" onClick={() => void retryCreatedChallenge()}>목록 다시 불러오기</button>
            : <button type="button" onClick={() => { resetCreateIntent(); setCreateOpen(true) }}>우리 팀 만들기</button>}
        </section>}

        <section className={styles.challengeList} aria-labelledby="challenge-list-title">
          <div className="flex items-center gap-2"><Trophy className="text-boot-primary" size={20} /><h2 id="challenge-list-title" className="text-xl font-black">진행 중인 모집</h2></div>
          {notice ? <p role="status" className="mt-3 rounded-[8px] bg-white px-4 py-3 text-sm font-black text-boot-coral">{notice}</p> : null}
          {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-boot-primary" /></div>
            : loadError ? <div role="alert" className="mt-4 rounded-[12px] border border-boot-coral/25 bg-white p-5 text-sm font-bold text-boot-coral">학과 대항 모집을 불러오지 못했어요.<button type="button" onClick={() => void load()} className="ml-2 underline">다시 시도</button></div>
              : challenges.length ? <div className="mt-4 grid gap-4">{challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} busy={busy} mutate={mutate} startInviteOpen={challenge.id === createdChallengeId} />)}</div>
                : <p className="mt-4 rounded-[12px] border border-dashed border-boot-hairline bg-white p-6 text-center text-sm font-bold text-boot-muted">아직 학과 대항 모집이 없어요.</p>}
        </section>
      </div>
    </main>
  )
}

function PlannedRoster({ capacity, onPlannedSlotClick }: { capacity: number; onPlannedSlotClick: () => void }) {
  const visibleSlotCount = Math.min(capacity, 5)
  return <ol className={styles.plannedRoster} aria-label="팀 생성 전 계획된 정원 슬롯">
    {Array.from({ length: visibleSlotCount }, (_, index) => <li key={index}>
      {index === 0 ? <>
        <span className={styles.meSlot}>YOU</span>
        <small>나</small>
      </> : <>
        <button type="button" onClick={onPlannedSlotClick} aria-label={`팀 생성 후 초대할 자리 ${index + 1}`}><Plus aria-hidden="true" size={26} /></button>
        <small>예정 자리</small>
      </>}
    </li>)}
    {capacity > visibleSlotCount ? <li className={styles.moreSlots} aria-label={`추가 예정 자리 ${capacity - visibleSlotCount}개`}><span>+{capacity - visibleSlotCount}</span><small>추가 자리</small></li> : null}
  </ol>
}

function ChallengeCard({ challenge, busy, mutate, startInviteOpen }: { challenge: Challenge; busy: boolean; mutate: Mutate; startInviteOpen: boolean }) {
  const [startsAt, setStartsAt] = useState(challenge.scheduled_at ? toLocalInput(challenge.scheduled_at) : '')
  const [endsAt, setEndsAt] = useState(challenge.ends_at ? toLocalInput(challenge.ends_at) : '')
  const [place, setPlace] = useState(challenge.place_name ?? '')
  const [ownScore, setOwnScore] = useState(0)
  const [opponentScore, setOpponentScore] = useState(0)
  const mutation = (suffix: string, body: Record<string, unknown>, method?: string) => mutate(`/api/community/department/challenges/${encodeURIComponent(challenge.id)}${suffix}`, { ...body, expected_revision: challenge.revision, idempotency_key: crypto.randomUUID() }, method)
  return <article className="rounded-[12px] border border-boot-hairline bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1 text-xs font-black text-boot-primary">{challenge.category === 'soccer' ? <Trophy size={15} /> : <Gamepad2 size={15} />}{challenge.category === 'soccer' ? '축구' : '게임'}</p><h3 className="mt-1 text-xl font-black">{challenge.title}</h3></div><span className="rounded-[6px] bg-boot-soft px-2 py-1 text-xs font-black text-boot-primary">{challengeStatus(challenge.status)}</span></div>{challenge.rules ? <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">{challenge.rules}</p> : null}{challenge.scheduled_at ? <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-boot-muted"><span className="flex gap-1"><CalendarDays size={15} />{formatDate(challenge.scheduled_at)}</span><span className="flex gap-1"><MapPin size={15} />{challenge.place_name}</span></div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2">{challenge.teams.map((team) => <section key={team.id} className="rounded-[8px] bg-boot-soft p-3"><div className="flex justify-between gap-2"><h4 className="font-black">{team.department_label}</h4><span className="text-xs font-black text-boot-primary">{team.accepted_count}/{team.capacity}명</span></div><RosterSlots team={team} />{team.may_request_roster && !team.roster.some((entry) => entry.is_me && ['requested', 'accepted'].includes(entry.status)) ? <button type="button" disabled={busy} onClick={() => void mutation('/roster', { team_id: team.id })} className={smallButton}>팀 참가 요청</button> : null}{!team.is_captain && team.roster.some((entry) => entry.is_me && ['requested', 'accepted'].includes(entry.status)) ? <button type="button" disabled={busy} onClick={() => void mutation('/roster', { team_id: team.id }, 'DELETE')} className={smallButton}>팀에서 나가기</button> : null}{team.is_captain ? team.roster.filter((entry) => entry.status === 'requested').map((entry) => <button key={entry.id} type="button" disabled={busy} onClick={() => void mutation(`/roster/${encodeURIComponent(entry.id)}/accept`, {})} className={smallButton}>{entry.alias} 수락</button>) : null}</section>)}</div><ChallengeInvitePanel challenge={challenge} busy={busy} mutate={mutate} startOpen={startInviteOpen} />{challenge.can_accept_opponent ? <button type="button" disabled={busy} onClick={() => void mutation('/opponent', {})} className={`${primaryButton} mt-4`}>상대 학과로 수락</button> : null}{challenge.is_captain && !['completed', 'cancelled'].includes(challenge.status) ? <div className="mt-4 border-t border-boot-hairline pt-4"><h4 className="text-sm font-black">양쪽 일정 확인</h4><div className="mt-2 grid gap-2 sm:grid-cols-3"><input aria-label="대항 시작 시간" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} /><input aria-label="대항 종료 시간" value={endsAt} type="datetime-local" onChange={(event) => setEndsAt(event.target.value)} className={inputClass} /><input aria-label="대항 장소" value={place} onChange={(event) => setPlace(event.target.value)} className={inputClass} /></div><button type="button" disabled={busy || !startsAt || !endsAt || !place.trim()} onClick={() => void mutation('/schedule', { scheduled_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), place_name: place })} className={`${smallButton} mt-2`}>이 일정 확인</button></div> : null}{challenge.is_captain && ['scheduled', 'result_pending'].includes(challenge.status) ? <div className="mt-4 border-t border-boot-hairline pt-4"><h4 className="text-sm font-black">양쪽 주장이 같은 결과를 확인해야 공개돼요</h4><div className="mt-2 flex items-center gap-2"><input aria-label="우리 팀 점수" type="number" min={0} max={999} value={ownScore} onChange={(event) => setOwnScore(Number(event.target.value))} className={scoreInput} /><span className="font-black">:</span><input aria-label="상대 팀 점수" type="number" min={0} max={999} value={opponentScore} onChange={(event) => setOpponentScore(Number(event.target.value))} className={scoreInput} /><button type="button" disabled={busy} onClick={() => void mutation('/result', { own_score: ownScore, opponent_score: opponentScore })} className={smallButton}>결과 확인</button></div></div> : null}{challenge.result ? <p className="mt-4 rounded-[8px] bg-[#EAF6F4] px-3 py-2 text-center text-lg font-black text-[#147A70]">확정 결과 {challenge.result.first_score} : {challenge.result.second_score}</p> : null}{challenge.is_captain && !['completed', 'cancelled'].includes(challenge.status) ? <button type="button" disabled={busy} onClick={() => { const reason = window.prompt('취소 이유를 입력해 주세요.')?.trim(); if (reason) void mutation('/cancel', { reason }) }} className="mt-4 min-h-11 rounded-[8px] border border-boot-coral/30 px-3 text-sm font-black text-boot-coral">대항 모집 취소</button> : null}<p className="mt-4 flex gap-2 text-xs font-bold leading-5 text-boot-muted"><ShieldCheck size={16} className="shrink-0 text-[#147A70]" />참가 요청과 주장 수락을 서버에서 따로 기록하며, 한 사용자는 같은 대항의 두 팀에 들어갈 수 없어요.</p></article>
}

function RosterSlots({ team }: { team: ChallengeTeam }) {
  const accepted = team.roster.filter((entry) => entry.status === 'accepted')
  const slots = buildDepartmentRosterSlots({
    capacity: team.capacity,
    acceptedCount: team.accepted_count,
    acceptedMembers: accepted,
  })
  return <ol className={styles.actualRoster} aria-label={`${team.department_label} 정원 슬롯`}>
    {slots.map((slot) => <li key={slot.key}>
      <span className={slot.kind === 'empty' ? styles.actualEmpty : styles.actualMember}>{slot.kind === 'empty' ? <Plus aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={15} />}</span>
      <small>{slot.label}</small>
    </li>)}
  </ol>
}

function ChallengeInvitePanel({ challenge, busy, mutate, startOpen }: {
  challenge: Challenge
  busy: boolean
  mutate: Mutate
  startOpen: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  const [state, setState] = useState<DepartmentChallengeInviteState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const captainTeam = challenge.teams.find((team) => team.is_captain)

  useEffect(() => { if (startOpen) setOpen(true) }, [startOpen])

  const loadInvites = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/community/department/challenges/${encodeURIComponent(challenge.id)}/invites`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as { invite_state?: unknown } | null
      const parsed = response.ok ? parseDepartmentChallengeInviteState(payload?.invite_state) : null
      if (!parsed) throw new Error('invalid_invite_state')
      setState(parsed)
    } catch { setError('친구 초대 상태를 불러오지 못했어요.') }
    finally { setLoading(false) }
  }, [challenge.id])

  useEffect(() => { if (open) void loadInvites() }, [open, loadInvites, challenge.revision])

  async function invite(friendUserId: string) {
    if (!captainTeam) return
    const result = await mutate(`/api/community/department/challenges/${encodeURIComponent(challenge.id)}/invites`, {
      team_id: captainTeam.id,
      friend_user_id: friendUserId,
      expected_revision: state?.revision ?? challenge.revision,
      idempotency_key: crypto.randomUUID(),
    })
    if (result.saved) void loadInvites()
  }

  async function accept(inviteId: string) {
    const result = await mutate(`/api/community/department/challenges/${encodeURIComponent(challenge.id)}/invites/${encodeURIComponent(inviteId)}/accept`, {
      expected_revision: state?.revision ?? challenge.revision,
      idempotency_key: crypto.randomUUID(),
    })
    if (result.saved) void loadInvites()
  }

  return <section className="mt-4 rounded-[8px] border border-[#E8D9C9] bg-[#FFF9F2] p-3">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-black text-[#9A4E30]"><span className="flex items-center gap-2"><UsersRound size={17} />친구 초대·받은 초대</span><span>{open ? '닫기' : '열기'}</span></button>
    {open ? <div className="border-t border-[#E8D9C9] pt-3">
      <p className="text-xs font-bold leading-5 text-[#765846]">수락한 친구 중 현재 학교와 학과가 같은 사람만 보여요. 초대 수락은 팀 참가일 뿐 친구 관계를 새로 만들지 않아요.</p>
      {loading ? <p className="mt-3 flex items-center gap-2 text-xs font-bold text-boot-muted"><Loader2 size={14} className="animate-spin" />확인 중</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs font-bold text-boot-coral">{error}<button type="button" onClick={() => void loadInvites()} className="ml-2 underline">다시 시도</button></p> : null}
      {state?.incoming.map((invite) => <div key={invite.invite_id} className="mt-3 flex items-center justify-between gap-3 rounded-md bg-white p-3"><div><p className="text-xs font-black">{invite.display_name}님의 팀 초대</p><p className="mt-0.5 text-[11px] text-boot-muted">내가 직접 수락해야 참가해요.</p></div><button type="button" disabled={busy} onClick={() => void accept(invite.invite_id)} className="min-h-10 rounded-md bg-[#B94B3F] px-3 text-xs font-black text-white disabled:opacity-45">수락</button></div>)}
      {captainTeam ? <div className="mt-3"><h5 className="text-xs font-black">초대 가능한 친구</h5>{state && state.candidates.length === 0 ? <p className="mt-2 text-xs text-boot-muted">현재 초대할 수 있는 같은 학과 친구가 없어요.</p> : null}<div className="mt-2 grid gap-2 sm:grid-cols-2">{state?.candidates.map((candidate) => <button key={candidate.user_id} type="button" disabled={busy} onClick={() => void invite(candidate.user_id)} className="flex min-h-11 items-center justify-between rounded-md border border-[#E8D9C9] bg-white px-3 text-left text-xs font-black text-[#765846] disabled:opacity-45"><span>{candidate.display_name}</span><Send size={14} /></button>)}</div>{state && state.sent.length > 0 ? <p className="mt-3 text-[11px] font-bold text-boot-muted">보낸 초대 {state.sent.filter((invite) => invite.status === 'pending').length}개가 답변을 기다리고 있어요.</p> : null}</div> : null}
    </div> : null}
  </section>
}


const inputClass = 'min-h-11 w-full rounded-[8px] border border-boot-hairline bg-white px-3 text-sm font-bold outline-none focus:border-boot-primary'
const primaryButton = 'min-h-12 w-full rounded-[8px] bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45'
const smallButton = 'mt-3 min-h-10 rounded-[8px] border border-boot-primary/25 bg-white px-3 text-xs font-black text-boot-primary disabled:opacity-45'
const scoreInput = 'h-11 w-20 rounded-[8px] border border-boot-hairline px-2 text-center font-black'
function toLocalInput(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16) }
function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function challengeStatus(status: Challenge['status']) { return ({ recruiting: '우리 팀 모집', opponent_pending: '상대 모집', scheduled: '일정 확정', result_pending: '결과 확인 중', completed: '완료', cancelled: '취소' } as const)[status] }
function challengeError(error: unknown) { const message = error instanceof Error ? error.message : ''; if (message.includes('stale')) return '상태가 먼저 바뀌었어요. 최신 내용을 다시 불러왔습니다.'; if (message.includes('department')) return '현재 학과 정보로는 이 요청을 진행할 수 없어요.'; if (message.includes('full')) return '방금 팀 정원이 마감됐어요.'; return '요청을 저장하지 못했어요. 최신 상태를 확인해 주세요.' }
