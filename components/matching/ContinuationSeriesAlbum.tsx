'use client'

import { Camera, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  CONTINUATION_SERIES_ALBUM_MAX_BYTES,
  parseContinuationSeriesAlbumPayload,
  type ContinuationSeriesAlbumDay,
  type ContinuationSeriesAlbumPayload,
} from '@/lib/matching/continuation-series-album'

type LoadState = 'loading' | 'ready' | 'error'
type UploadAttempt = {
  targetKey: string
  file: File
  idempotencyKey: string
}

export default function ContinuationSeriesAlbum({ seriesId }: { seriesId: string }) {
  const [payload, setPayload] = useState<ContinuationSeriesAlbumPayload | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [selectedTargetKey, setSelectedTargetKey] = useState('')
  const [uploadAttempt, setUploadAttempt] = useState<UploadAttempt | null>(null)
  const [busyKey, setBusyKey] = useState('')
  const [notice, setNotice] = useState('')
  const loadSequence = useRef(0)

  const load = useCallback(async (background = false) => {
    const sequence = ++loadSequence.current
    if (!background) {
      setLoadState('loading')
      setNotice('')
    }
    try {
      const response = await fetch(`/api/match/series/${encodeURIComponent(seriesId)}/album`, {
        cache: 'no-store',
      })
      const value = await response.json().catch(() => null)
      if (!response.ok) throw new Error('album_load_failed')
      const parsed = parseContinuationSeriesAlbumPayload(value)
      if (sequence !== loadSequence.current) return
      setPayload(parsed)
      setSelectedTargetKey((current) => (
        parsed.days.some((day) => targetKey(day) === current) ? current : targetKey(parsed.days[0])
      ))
      setLoadState('ready')
    } catch {
      if (sequence !== loadSequence.current) return
      setPayload(null)
      setLoadState('error')
    }
  }, [seriesId])

  useEffect(() => {
    setPayload(null)
    setSelectedTargetKey('')
    setUploadAttempt(null)
    setNotice('')
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const interval = window.setInterval(refresh, 240_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      loadSequence.current += 1
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load, seriesId])

  const selectedDay = useMemo(
    () => payload?.days.find((day) => targetKey(day) === selectedTargetKey) ?? payload?.days[0] ?? null,
    [payload, selectedTargetKey],
  )

  function selectFile(day: ContinuationSeriesAlbumDay, file: File | null) {
    setNotice('')
    if (!file) {
      setUploadAttempt(null)
      return
    }
    setUploadAttempt({
      targetKey: targetKey(day),
      file,
      idempotencyKey: crypto.randomUUID(),
    })
  }

  async function upload(day: ContinuationSeriesAlbumDay) {
    if (!uploadAttempt || uploadAttempt.targetKey !== targetKey(day)) return
    setBusyKey('upload')
    setNotice('')
    try {
      const form = new FormData()
      form.set('targetKind', day.targetKind)
      form.set('targetId', day.targetId)
      form.set('idempotencyKey', uploadAttempt.idempotencyKey)
      form.set('photo', uploadAttempt.file)
      const response = await fetch(`/api/match/series/${encodeURIComponent(seriesId)}/album`, {
        method: 'POST',
        body: form,
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error('album_upload_failed')
      if (response.status === 202 || result?.status === 'uploading') {
        setNotice('업로드 확인이 끝나지 않았어요. 같은 사진으로 다시 시도할 수 있어요.')
        return
      }
      setUploadAttempt(null)
      await load(true)
      setNotice('사진을 앨범에 추가했어요.')
    } catch {
      setNotice('사진을 올리지 못했어요. 선택한 사진을 유지했으니 다시 시도해 주세요.')
    } finally {
      setBusyKey('')
    }
  }

  async function remove(photoId: string) {
    setBusyKey(`delete:${photoId}`)
    setNotice('')
    try {
      const response = await fetch(
        `/api/match/series/${encodeURIComponent(seriesId)}/album/${encodeURIComponent(photoId)}`,
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error('album_delete_failed')
      await load(true)
      setNotice('내 사진을 삭제했어요.')
    } catch {
      await load(true)
      setNotice('삭제 상태를 확인하지 못했어요. 다시 불러온 뒤 삭제를 마저 처리해 주세요.')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <section className="rounded-3xl border border-boot-hairline bg-white p-5 shadow-[0_18px_42px_rgba(23,20,18,0.06)] sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7F5] text-[#147A70]">
          <Camera size={21} />
        </span>
        <div>
          <p className="text-[11px] font-black tracking-[0.16em] text-[#147A70]">선택 기능 · 우리만 보는 사진</p>
          <h2 className="mt-1 text-xl font-black text-boot-ink">계속 만나기 앨범</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
            참여한 회차의 사진만 함께 볼 수 있어요. 사진을 올리지 않아도 참석·진행에는 영향이 없어요.
          </p>
        </div>
      </div>

      {loadState === 'loading' ? (
        <div className="mt-5 flex min-h-28 items-center justify-center gap-2 rounded-2xl bg-boot-soft text-sm font-black text-boot-muted">
          <Loader2 className="animate-spin" size={18} /> 앨범을 확인하는 중이에요.
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="mt-5 rounded-2xl border border-boot-hairline bg-boot-soft p-4">
          <p className="text-sm font-bold leading-6 text-boot-muted">앨범을 불러오지 못했어요. 이 화면에서는 기존 사진을 변경하지 않았어요.</p>
          <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-boot-primary">
            <RefreshCw size={16} /> 다시 불러오기
          </button>
        </div>
      ) : null}

      {loadState === 'ready' && payload?.days.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-boot-soft p-4 text-sm font-bold leading-6 text-boot-muted">
          아직 앨범을 열 수 있는 참여 회차가 없어요. 참여 확인이 끝나면 여기에 표시됩니다.
        </p>
      ) : null}

      {loadState === 'ready' && payload && payload.pendingDeletionPhotoIds.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[#D97706]/25 bg-[#FFF7E8] p-4">
          <p className="text-sm font-black text-[#8A4B08]">삭제 확인이 남은 내 사진</p>
          <p className="mt-1 text-xs font-bold leading-5 text-[#8A5A22]">사진은 앨범 목록에 표시하지 않아요. 저장소 삭제를 다시 확인할 수 있어요.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {payload.pendingDeletionPhotoIds.map((photoId) => (
              <button
                key={photoId}
                type="button"
                disabled={busyKey !== ''}
                onClick={() => void remove(photoId)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-black text-[#8A4B08] disabled:opacity-45"
              >
                {busyKey === `delete:${photoId}` ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                삭제 마저 처리
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loadState === 'ready' && payload && payload.pendingUploads.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[#147A70]/20 bg-[#EAF7F5] p-4">
          <p className="text-sm font-black text-[#11665E]">완료되지 않은 내 업로드</p>
          <p className="mt-1 text-xs font-bold leading-5 text-[#376E69]">
            새로고침 뒤에도 남은 업로드예요. 현재 처리가 끝나거나 제한 시간이 지난 뒤 안전하게 정리할 수 있어요.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {payload.pendingUploads.map((upload) => (
              <button
                key={upload.photoId}
                type="button"
                disabled={busyKey !== '' || !upload.canCancel}
                onClick={() => void remove(upload.photoId)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-black text-[#11665E] disabled:opacity-45"
              >
                {busyKey === `delete:${upload.photoId}` ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                {upload.canCancel ? '미완료 업로드 정리' : '업로드 처리 확인 중'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loadState === 'ready' && payload && payload.days.length > 0 ? (
        <>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="앨범 회차 선택">
            {payload.days.map((day) => {
              const key = targetKey(day)
              const active = selectedDay ? targetKey(selectedDay) === key : false
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedTargetKey(key)
                    setUploadAttempt(null)
                    setNotice('')
                  }}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black ${active ? 'bg-boot-primary text-white' : 'border border-boot-hairline bg-white text-boot-muted'}`}
                >
                  프로그램 Day {day.programDay}
                </button>
              )
            })}
          </div>

          {selectedDay ? (
            <div className="mt-4">
              <p className="text-sm font-black text-boot-ink">
                프로그램 Day {selectedDay.programDay} · 실제 {selectedDay.physicalMeetingNo}번째 만남
              </p>
              {selectedDay.targetKind === 'source' ? (
                <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">첫 보드게임이 프로그램 Day 1로 인정된 기록이에요.</p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectedDay.photos.map((photo) => (
                  <figure key={photo.id} className="overflow-hidden rounded-2xl border border-boot-hairline bg-boot-soft">
                    <img src={photo.signedUrl} alt={`프로그램 Day ${selectedDay.programDay} 앨범 사진`} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
                    {photo.mine ? (
                      <button
                        type="button"
                        disabled={busyKey !== ''}
                        onClick={() => void remove(photo.id)}
                        className="flex min-h-11 w-full items-center justify-center gap-1 bg-white px-2 text-xs font-black text-boot-muted disabled:opacity-45"
                      >
                        {busyKey === `delete:${photo.id}` ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                        내 사진 삭제
                      </button>
                    ) : null}
                  </figure>
                ))}
              </div>
              {selectedDay.photos.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-boot-soft p-4 text-center text-sm font-bold text-boot-muted">아직 함께 올린 사진이 없어요.</p>
              ) : null}

              <div className="mt-4 rounded-2xl border border-boot-hairline p-4">
                {selectedDay.canUpload ? (
                  <>
                    <label className="block text-sm font-black text-boot-ink" htmlFor={`series-album-${selectedDay.targetId}`}>
                      사진 고르기
                    </label>
                    <input
                      id={`series-album-${selectedDay.targetId}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busyKey !== ''}
                      onChange={(event) => selectFile(selectedDay, event.currentTarget.files?.[0] ?? null)}
                      className="mt-2 block w-full text-xs font-bold text-boot-muted file:mr-3 file:min-h-10 file:rounded-xl file:border-0 file:bg-boot-soft file:px-3 file:font-black file:text-boot-primary"
                    />
                    <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">JPG·PNG·WebP, 최대 {CONTINUATION_SERIES_ALBUM_MAX_BYTES / 1024 / 1024}MB · 위치 정보는 제거해 저장해요.</p>
                    {uploadAttempt?.targetKey === targetKey(selectedDay) ? (
                      <button
                        type="button"
                        disabled={busyKey !== ''}
                        onClick={() => void upload(selectedDay)}
                        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45"
                      >
                        {busyKey === 'upload' ? <Loader2 className="animate-spin" size={17} /> : <UploadCloud size={17} />}
                        {busyKey === 'upload' ? '확인하는 중…' : '이 사진 올리기'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm font-bold leading-6 text-boot-muted">
                    {selectedDay.uploadClosesAt === null
                      ? '완료 시각이 확인되기 전에는 업로드할 수 없어요.'
                      : `이 회차의 업로드 기간이 끝났어요. (${formatDate(selectedDay.uploadClosesAt)}까지)`}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {notice ? <p role="status" className="mt-4 text-xs font-bold leading-5 text-boot-muted">{notice}</p> : null}
      <p className="mt-4 text-[11px] font-bold leading-5 text-boot-muted">사진은 비공개 저장소에 보관하고 5분짜리 보기 주소로 표시해요. 앨범 표시 기준은 최대 90일입니다.</p>
    </section>
  )
}

function targetKey(day: Pick<ContinuationSeriesAlbumDay, 'targetKind' | 'targetId'> | undefined) {
  return day ? `${day.targetKind}:${day.targetId}` : ''
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
