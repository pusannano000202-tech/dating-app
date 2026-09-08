'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Clock3, Users, RefreshCw, HeartHandshake, Megaphone, MessageCircle, GraduationCap } from 'lucide-react'
import { VOICE_TOPICS, type VoiceTopic, type VoiceRoom } from '@/lib/voice/contracts'
import { voiceFetch } from '@/lib/voice/client'
import PhotoSceneCarousel, { type PhotoScene } from '@/components/social/PhotoSceneCarousel'
import { getCheerTeam, getCheerTeams, type CheerLeague } from '@/lib/voice/cheer-catalog'
import { VOICE_CATEGORIES, getVoiceCategoryScenes, type VoiceCategoryId } from '@/lib/social/voice-discovery'
import s from './voice.module.css'

const VOICE_SCENES: readonly PhotoScene[] = [
  { id: 'lck', eyebrow: 'LCK', title: '응원할 팀을 고르고 함께 소리쳐요', description: '경기 영상은 각자 보고, 같은 팀 팬 5명씩 목소리로 모여요.', image: '/social-scenes/voice.png', imageAlt: '게임 응원 분위기를 담은 편집 사진', actionLabel: 'LCK 팀 고르기' },
  { id: 'kbo', eyebrow: 'KBO', title: '오늘 경기, 같은 팀 팬과 응원해요', description: '열 개 팀을 모두 보고 내 응원팀의 5인 방에 입장해요.', image: '/social-scenes/baseball.png', imageAlt: '야구 응원 분위기를 담은 편집 사진', actionLabel: 'KBO 팀 고르기' },
  { id: 'football', eyebrow: '축구', title: '같이 보며 응원할 사람을 찾아요', description: '대상 리그와 운영 기준을 확인한 뒤 열 예정이에요.', image: '/social-scenes/football.png', imageAlt: '축구장에서 응원하는 성인 팬들의 뒷모습을 담은 연출 사진', actionLabel: '축구 방 보기', disabled: true, note: '대상 리그와 일정 출처를 확정한 뒤 공개해요.' },
  { id: 'romance', eyebrow: '연애', title: '답을 정하기보다 먼저 들어요', description: '내 이야기를 말하거나, 오늘은 누군가의 이야기를 들어줘요.', image: '/social-scenes/advice.png', imageAlt: '차분한 대화 분위기를 담은 편집 사진', actionLabel: '역할 고르기', href: '/community/voice/random?topic=worries&adviceTopic=romance' },
  { id: 'career', eyebrow: '취업', title: '진로 고민을 혼자 안고 있지 마세요', description: '면접, 인턴, 진로 고민을 말하기와 듣기 역할로 나눠요.', image: '/social-scenes/posts.png', imageAlt: '노트와 커피가 놓인 카페 편집 사진', actionLabel: '진로 이야기 시작', href: '/community/voice/random?topic=worries&adviceTopic=career' },
  { id: 'social', eyebrow: '수다', title: '별일 없는 날도 함께 이야기해요', description: '수업 끝, 자기 전. 가볍게 들러 이야기할 친구를 만나요.', image: '/social-scenes/content.png', imageAlt: '대학가의 편안한 모임 분위기를 담은 편집 사진', actionLabel: '가벼운 수다 찾기', href: '/community/voice/random?topic=social' },
  { id: 'department', eyebrow: '학과', title: '우리 과 사람들과 가볍게 모여요', description: '친구 자동 추가 없이, 원하는 학과 모집방에만 직접 참여해요.', image: '/social-scenes/boardgame.webp', imageAlt: '함께 모이는 분위기를 담은 편집 사진', actionLabel: '학과 방 보기' },
]

export function VoiceCounts({ room }: { room: VoiceRoom }) {
  const connected = room.connected.genderBreakdown
  const waiting = room.waiting.genderBreakdown
  return <div className={s.counts}>
    지금 연결 {room.connected.totalPeople}명 · 남 {connected.malePeople} · 여 {connected.femalePeople} · 기타·미입력 {connected.otherOrUnspecifiedPeople}<br />
    연결 준비 {room.waiting.totalPeople}명 · 남 {waiting.malePeople} · 여 {waiting.femalePeople} · 기타·미입력 {waiting.otherOrUnspecifiedPeople}<br />
    {new Date(room.connected.asOf).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
  </div>
}

export default function VoiceHub() {
  const router = useRouter()
  const [category, setCategory] = useState<VoiceCategoryId>('cheer')
  const [topic, setTopic] = useState<VoiceTopic>('baseball')
  const [rooms, setRooms] = useState<VoiceRoom[] | null>(null)
  const [error, setError] = useState('')
  const [providerReady, setProvider] = useState(false)
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState<CheerLeague>('lck')
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [cheerOpen, setCheerOpen] = useState(false)
  const [officialOpen, setOfficialOpen] = useState(false)
  const [rulesConfirmed, setRulesConfirmed] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinError, setJoinError] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true)
      const data = await voiceFetch<{ rooms: VoiceRoom[]; providerReady: boolean }>('/api/voice/rooms', undefined, signal)
      setRooms(data.rooms)
      setProvider(data.providerReady)
      setError('')
    } catch (caught) {
      if (!signal?.aborted) {
        setRooms(null)
        setProvider(false)
        setError(caught instanceof Error ? caught.message : '불러오지 못했어요.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal)
    }, 20000)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [load])

  function reveal(id: 'cheer-teams' | 'official-rooms') {
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function openCheer(nextLeague: CheerLeague) {
    setLeague(nextLeague)
    setSelectedTeamId(null)
    setRulesConfirmed(false)
    setCheerOpen(true)
    reveal('cheer-teams')
  }

  function openDepartmentRooms() {
    setTopic('department')
    setOfficialOpen(true)
    reveal('official-rooms')
  }

  function chooseCategory(nextCategory: VoiceCategoryId) {
    if (nextCategory === category || joinBusy) return
    setCategory(nextCategory)
    setCheerOpen(false)
    setOfficialOpen(false)
    setSelectedTeamId(null)
    setRulesConfirmed(false)
    setJoinError('')
    setLeague('lck')
    setTopic(nextCategory === 'cheer' ? 'baseball' : nextCategory === 'department' ? 'department' : 'worries')
  }

  async function joinCheerRoom() {
    const team = selectedTeamId ? getCheerTeam(selectedTeamId) : null
    if (!team || joinBusy || !rulesConfirmed) {
      if (!rulesConfirmed) setJoinError('참여 전에 대화 약속을 확인해 주세요.')
      return
    }
    setJoinBusy(true)
    setJoinError('')
    try {
      await voiceFetch('/api/voice/rules', {})
      const result = await voiceFetch<{ sessionId: string }>('/api/voice/cheer/rooms', {
        teamId: team.id,
        idempotencyKey: crypto.randomUUID(),
      })
      router.push('/community/voice/session/' + result.sessionId)
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : '응원방에 입장하지 못했어요.')
    } finally {
      setJoinBusy(false)
    }
  }

  const scenes = getVoiceCategoryScenes(VOICE_SCENES, category).map((scene) => {
    if (scene.id === 'lck') return { ...scene, onSelect: () => openCheer('lck') }
    if (scene.id === 'kbo') return { ...scene, onSelect: () => openCheer('kbo') }
    if (scene.id === 'department') return { ...scene, onSelect: openDepartmentRooms }
    return scene
  })
  const activeCategory = VOICE_CATEGORIES.find(item => item.id === category)!
  const officialTopics = VOICE_TOPICS.filter(item => activeCategory.officialTopics.includes(item.id))
  const selected = VOICE_TOPICS.find((item) => item.id === topic)!
  const filtered = rooms?.filter((room) => room.topic === topic && ['open', 'scheduled', 'delayed'].includes(room.status)) ?? []

  return <main className={s.page}>
    <div className={s.container}>
      <header className={s.header}>
        <Link className={s.back} href="/community"><ArrowLeft size={17} />커뮤니티</Link>
        <span className={s.brand}>QUANTUM · VOICE LOUNGE</span>
      </header>
      <p className={s.eyebrow}>목소리로, 조금 더 가까이</p>
      <h1 className={s.title}>오늘은 어떤 이야기로 만날까요?</h1>
      <p className={s.subtitle}>같이 응원하거나, 이야기하거나. 먼저 하고 싶은 걸 골라요.</p>
      <div className={s.categories} role="group" aria-label="보이스 카테고리">
        {VOICE_CATEGORIES.map(item => {
          const Icon = item.id === 'cheer' ? Megaphone : item.id === 'conversation' ? MessageCircle : GraduationCap
          return <button key={item.id} type="button" aria-pressed={category === item.id} aria-controls="voice-category-content" disabled={joinBusy} onClick={() => chooseCategory(item.id)}>
            <Icon size={22} aria-hidden="true" />
            <strong>{item.label}</strong>
            <span>{item.summary}</span>
          </button>
        })}
      </div>
      <div id="voice-category-content" className={s.categoryContent}>
      <p className={s.categoryContext} aria-live="polite">{activeCategory.label}<span>{category === 'cheer' ? '종목을 고르고, 같은 팀 팬을 만나요' : category === 'conversation' ? '말하고 싶은 주제로 가볍게 시작해요' : '우리 과 사람들과 목소리로 친해져요'}</span></p>
      <PhotoSceneCarousel
        key={category}
        label="보이스 테마"
        items={scenes}
        showNavigation={scenes.length > 1}
        onChange={(id) => {
          setCheerOpen(false)
          setSelectedTeamId(null)
          setRulesConfirmed(false)
          setJoinError('')
          setOfficialOpen(false)
          if (id === 'lck' || id === 'kbo') {
            setLeague(id)
          }
          if (id === 'department') setTopic('department')
        }}
      />
      </div>

      {cheerOpen && <section className={s.cheerPanel} id="cheer-teams" aria-labelledby="cheer-heading">
        <div className={s.sectionHead}>
          <div><p className={s.eyebrow}>5명씩 자동 분화</p><h2 id="cheer-heading">내 응원팀 선택</h2></div>
          <div className={s.leagueTabs} role="group" aria-label="응원 리그">
            {(['lck', 'kbo'] as const).map((value) => <button key={value} type="button" aria-pressed={league === value} onClick={() => {
              setLeague(value)
              setSelectedTeamId(null)
              setRulesConfirmed(false)
            }}>{value.toUpperCase()}</button>)}
          </div>
        </div>
        <div className={s.teamGrid}>
          {getCheerTeams(league).map((team) => <button key={team.id} type="button" aria-pressed={selectedTeamId === team.id} onClick={() => setSelectedTeamId(team.id)}>
            {/* Catalog assets are public team marks, never member profile images. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={team.logo} alt="" aria-hidden="true" />
            <span>{team.name}</span>
          </button>)}
        </div>
        <p className={s.small}>선택한 팀과 학교가 같은 사람을 한 방 최대 5명으로 묶어요. 이름·전화번호는 공개하지 않아요.</p>
        <label className={s.rulesCheck}>
          <input type="checkbox" checked={rulesConfirmed} onChange={(event) => setRulesConfirmed(event.target.checked)} />
          비난·성희롱·개인정보 요구 없이 대화하고, 마이크는 직접 켜겠습니다.
        </label>
        {loading && <p className={s.notice} role="status">통화 연결 상태를 확인하고 있어요.</p>}
        {!loading && error && <div className={s.error} role="alert">통화 연결 상태를 확인하지 못했어요.<button className={s.back} type="button" onClick={() => void load()}><RefreshCw size={14} />다시 확인</button></div>}
        {!loading && !error && !providerReady && <p className={s.notice}>통화 서버를 준비 중이에요. 아직 응원방에 입장할 수 없어요.</p>}
        {joinError && <p className={s.error} role="alert">{joinError}</p>}
        <button className={s.primary} type="button" disabled={!selectedTeamId || !rulesConfirmed || joinBusy || loading || !!error || !providerReady} onClick={() => void joinCheerRoom()}>
          {joinBusy ? '입장 중' : '약속 확인하고 5인방 입장'}
        </button>
      </section>}

      <details id="official-rooms" className={s.officialRooms} open={officialOpen} onToggle={(event) => setOfficialOpen(event.currentTarget.open)}>
        <summary>{activeCategory.label} · 공식 모집방 둘러보기</summary>
        <div className={s.officialBody}>
          <label className={s.field}>모집 주제
            <select value={topic} onChange={(event) => setTopic(event.target.value as VoiceTopic)}>
              {officialTopics.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <div className={s.sectionHead}>
            <div><p className={s.eyebrow}>{selected.eyebrow}</p><h2>{selected.label} 공식 모집</h2></div>
            <button className={s.back} onClick={() => void load()} disabled={loading} aria-label="모집방 새로고침"><RefreshCw size={14} />{loading ? '확인 중' : '새로고침'}</button>
          </div>
          {error && <div className={s.error} role="alert">{error}<div className={s.actions}><Link className={s.back} href="/login?redirect=%2Fcommunity%2Fvoice">로그인 확인 <ArrowRight size={14} /></Link></div></div>}
          <div className={s.grid}>
            {filtered.map((room) => <article className={s.card} key={room.id}>
              <div className={s.cardTop}>
                <span className={s.badge + (room.status === 'open' ? ' ' + s.live : '')}>{room.status === 'open' ? '대화방 열림' : room.status === 'delayed' ? '일정 변경 확인 중' : '참여 예정'}</span>
                <span className={s.small}>Quantum 공식 모집</span>
              </div>
              <h3>{room.title}</h3><p>{room.description}</p>
              <div className={s.meta}>
                <span><Clock3 size={14} />{new Date(room.startsAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span><Users size={14} />최대 {room.capacity}명</span>
              </div>
              <VoiceCounts room={room} />
              <Link className={s.primary} href={'/community/voice/rooms/' + room.id}>방 둘러보기 <ArrowRight size={15} /></Link>
            </article>)}
            {!filtered.length && !loading && !error && <div className={s.empty}>
              <HeartHandshake size={26} className="mx-auto text-boot-primary" />
              <h3>아직 열린 모집방이 없어요</h3>
              <p className={s.subtitle}>운영자가 주제와 시간을 정하면 여기에서 참여할 수 있어요.</p>
            </div>}
            {loading && rooms === null && !error && <div className={s.empty} aria-live="polite">지금 참여할 수 있는 모집방을 확인하고 있어요.</div>}
          </div>
          {rooms !== null && !providerReady && <p className={s.notice}>통화 서버를 준비 중이에요. 모집방은 둘러볼 수 있지만 아직 음성 연결은 시작되지 않아요.</p>}
        </div>
      </details>

      <p className={s.notice}>참여 중인 인원은 성별별 실제 숫자로 공개돼요. 한 명이어도 집계하며 이름·전화번호를 함께 공개하지 않아요. 마이크는 직접 켜야 하고, 녹음·영상 송출은 제공하지 않아요. 고민 나눔은 또래 간 대화이며 전문 상담 서비스가 아니에요.</p>
    </div>
  </main>
}
