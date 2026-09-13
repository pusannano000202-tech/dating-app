'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Copy, Link2, MessageCircle, Share2, X } from 'lucide-react'
import { hasKakaoJavaScriptKey, shareGroupInviteOnKakao } from '@/lib/kakao-share'
import { canShareMeetup, copyMeetupShareLink, getMeetupShareUrl, shareMeetupWithDevice } from '@/lib/meetups/share'
import s from './meetup-share.module.css'

export default function MeetupShareSheet({ meetupId, title, onClose }: { meetupId: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const descriptionId = useId()
  const [url] = useState(() => getMeetupShareUrl(meetupId, typeof window === 'undefined' ? '' : window.location.origin))
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const shareData = { title: title.slice(0, 100), text: '함께할 친구를 모집하고 있어요. 모임을 확인하고 참가 신청해 주세요.', url: url ?? '' }
  const deviceAvailable = !!url && typeof navigator !== 'undefined' && canShareMeetup(navigator, shareData)
  const kakaoAvailable = !!url && hasKakaoJavaScriptKey()

  useEffect(() => {
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => { element?.close(); document.body.style.overflow = previousOverflow }
  }, [])

  async function copyLink(instagram = false) {
    if (!url || busy) return
    setBusy(true)
    const result = await copyMeetupShareLink(navigator, url)
    setStatus(result === 'copied'
      ? instagram ? '링크를 복사했어요. 인스타그램을 열고 친구와의 DM에 붙여 넣어 보내주세요.' : '모집 링크를 복사했어요. 함께하고 싶은 친구에게 보내주세요.'
      : '자동 복사가 안 돼요. 아래 모집 링크를 길게 누르거나 선택해서 직접 복사해 주세요.')
    setBusy(false)
  }

  async function shareOnDevice() {
    if (!url || busy) return
    setBusy(true)
    const result = await shareMeetupWithDevice(navigator, shareData)
    setStatus(result === 'opened' ? '기기 공유창으로 연결했어요. 전송 여부는 선택한 앱에서 확인해 주세요.'
      : result === 'cancelled' ? '공유를 취소했어요. 필요할 때 다시 공유할 수 있어요.'
      : '기기 공유창을 열지 못했어요. 모집 링크를 복사해서 보내주세요.')
    setBusy(false)
  }

  async function shareOnKakao() {
    if (!url || busy || !kakaoAvailable) return
    setBusy(true)
    setStatus('카카오톡 공유창을 준비하고 있어요.')
    try {
      await shareGroupInviteOnKakao({ title: shareData.title, description: shareData.text, url, buttonTitle: '모임 확인하기' })
      setStatus('카카오톡 공유를 요청했어요. 받는 사람과 전송 여부는 카카오톡에서 확인해 주세요.')
    } catch {
      setStatus('카카오톡 공유 연결을 확인하지 못했어요. 기기 공유나 모집 링크 복사를 이용해 주세요.')
    } finally { setBusy(false) }
  }

  return <dialog ref={dialog} className={s.sheet} aria-labelledby={headingId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={s.content}>
      <header className={s.header}><div><p>같이하면 더 즐거운 모임</p><h2 id={headingId}>친구에게 모임 보내기</h2></div><button type="button" onClick={onClose} className={s.close} aria-label="공유창 닫기" autoFocus><X size={21} aria-hidden="true" /></button></header>
      <div className={s.room}><span><Link2 size={20} aria-hidden="true" /></span><strong>{title}</strong></div>
      <p id={descriptionId} className={s.description}>친구는 이 방의 링크를 열고 로그인·가입 후 모임으로 돌아와 신청할 수 있어요.</p>
      {!url ? <p className={s.localNotice} role="status">현재는 외부에 공유할 수 없는 주소예요. 이 컴퓨터의 로컬 주소(localhost)는 다른 기기에서 열 수 없어요. 실제 서비스 주소에서 모집 링크를 공유해 주세요.</p> : null}
      <div className={s.options}>
        <button type="button" disabled={!kakaoAvailable || busy} onClick={() => void shareOnKakao()}><span className={s.kakao}><MessageCircle size={23} aria-hidden="true" /></span><strong>카카오톡</strong><small>{hasKakaoJavaScriptKey() ? '받는 사람 선택' : '공유 연결 준비 중'}</small></button>
        <button type="button" disabled={!deviceAvailable || busy} onClick={() => void shareOnDevice()}><span className={s.device}><Share2 size={23} aria-hidden="true" /></span><strong>기기 공유</strong><small>{deviceAvailable ? '설치된 앱에서 선택' : '이 환경에서는 미지원'}</small></button>
        <button type="button" disabled={!url || busy} onClick={() => void copyLink(true)}><span className={s.instagram}><Camera size={23} aria-hidden="true" /></span><strong>인스타그램</strong><small>DM에 보낼 링크 복사</small></button>
      </div>
      {url ? <><button className={s.copy} type="button" disabled={busy} onClick={() => void copyLink()}><Copy size={18} aria-hidden="true" />모집 링크 복사</button><label className={s.linkLabel}>모집 링크<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label></> : null}
      {status ? <p className={s.status} role="status">{status}</p> : null}
      <p className={s.footnote}>기기 공유에 표시되는 앱은 기기마다 달라요. 인스타그램은 링크를 직접 붙여 넣어 공유해요.</p>
      {url && !hasKakaoJavaScriptKey() ? <p className={s.footnote}>카카오톡 전용 공유는 서비스 연결 설정 후 사용할 수 있어요. 지금은 기기 공유나 링크 복사를 이용해 주세요.</p> : null}
    </div>
  </dialog>
}
