'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Headphones, Mic, ShieldCheck } from 'lucide-react'
import type { VoiceRoom } from '@/lib/voice/contracts'
import { voiceFetch, voiceCommand } from '@/lib/voice/client'
import { VoiceCounts } from './VoiceHub'
import s from './voice.module.css'
export default function VoiceRoomDetail({ roomId }: { roomId: string }) {
  const router = useRouter(),
    [room, setRoom] = useState<VoiceRoom | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    voiceFetch<{ room: VoiceRoom }>(
      '/api/voice/rooms/' + roomId,
      undefined,
      c.signal,
    )
      .then((d) => setRoom(d.room))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [roomId])
  async function join(mode: 'listen' | 'speak') {
    if (!room || pending) return
    setPending(true)
    setError('')
    try {
      await voiceFetch('/api/voice/rules', {})
      const result = await voiceFetch<{ sessionId: string }>(
        '/api/voice/rooms/' + roomId,
        voiceCommand('join', room.revision, { mode }),
      )
      router.push('/community/voice/session/' + result.sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '참여하지 못했어요.')
      const updated = await voiceFetch<{ room: VoiceRoom }>(
        '/api/voice/rooms/' + roomId,
      ).catch(() => null)
      if (updated) setRoom(updated.room)
    } finally {
      setPending(false)
    }
  }
  return (
    <main className={s.page}>
      <div className={s.session}>
        <Link className={s.back} href="/community/voice">
          <ArrowLeft size={16} />
          다른 이야기 보기
        </Link>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {room ? (
          <>
            <section className={s.stage}>
              <p className={s.eyebrow}>Quantum 공식 대화 모집</p>
              <h1>{room.title}</h1>
              <p className={s.subtitle}>{room.description}</p>
              <div className={s.people}>
                <div className={s.orb} aria-hidden="true">
                  <Headphones size={54} />
                </div>
              </div>
              <p className={s.subtitle}>
                {new Date(room.startsAt).toLocaleString('ko-KR')} · 최대{' '}
                {room.capacity}명
              </p>
              <VoiceCounts room={room} />
              {room.scheduleNotice && (
                <p className={s.notice}>
                  일정 변경 안내: {room.scheduleNotice}
                </p>
              )}
              {room.sourceUrl && (
                <p className={s.small}>
                  <a href={room.sourceUrl} target="_blank" rel="noreferrer">
                    공식 경기 일정 확인
                  </a>{' '}
                  · {room.sourceRevision}
                </p>
              )}
            </section>
            <div className={s.notice}>
              <strong>
                <ShieldCheck size={15} className="inline" /> 서로 편안하게
                이야기해요
              </strong>
              <br />
              비난·성희롱·개인정보 요구는 하지 않아요. 원하지 않으면 언제든 나갈
              수 있어요. 참여 인원은 성별별로 한 명이어도 공개하며, 이름과
              전화번호는 집계에 포함하지 않아요. 아래 버튼은 이 대화 약속을
              확인하고 참여하는 버튼이에요.
            </div>
            <div className={s.controls}>
              <button
                className={s.secondary}
                disabled={pending || room.status !== 'open'}
                onClick={() => void join('listen')}
              >
                <Headphones size={19} />
                듣기로 참여
              </button>
              <button
                className={s.primary}
                disabled={pending || room.status !== 'open'}
                onClick={() => void join('speak')}
              >
                <Mic size={19} />
                말하며 참여
              </button>
            </div>
            {room.status !== 'open' && (
              <p className={s.notice}>
                지금은{' '}
                {room.status === 'delayed'
                  ? '일정 변경을 확인 중이에요'
                  : room.status === 'scheduled'
                    ? '시작 전이에요'
                    : '종료된 방이에요'}
                . 대화방이 열리면 참여할 수 있어요.
              </p>
            )}
          </>
        ) : (
          !error && <p className={s.notice}>모집 내용을 확인하고 있어요.</p>
        )}
      </div>
    </main>
  )
}
