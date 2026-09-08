'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type HistoryNavigationEvent = Event & {
  navigationType: string
  destination: { url: string; sameDocument: boolean }
}

/** Relationship drafts stay in memory; never persist them just to survive navigation. */
export default function MbtiDraftNavigationGuard({ active, children }: { active: boolean; children: ReactNode }) {
  const [destination, setDestination] = useState<string | null>(null)
  const approvedExit = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (!active || approvedExit.current) return
      event.preventDefault()
      event.returnValue = '입력 중인 내용은 저장되지 않아요.'
    }
    const beforeLinkNavigation = (event: MouseEvent) => {
      if (!active || approvedExit.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const url = new URL(anchor.href, window.location.href)
      if (!['http:', 'https:'].includes(url.protocol) || (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setDestination(url.href)
    }
    const beforeHistoryNavigation = (event: Event) => {
      const historyEvent = event as HistoryNavigationEvent
      if (!active || approvedExit.current || !event.cancelable || historyEvent.navigationType !== 'traverse' || !historyEvent.destination.sameDocument) return
      const url = new URL(historyEvent.destination.url, window.location.href)
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      event.preventDefault()
      setDestination(url.href)
    }
    window.addEventListener('beforeunload', beforeunload)
    document.addEventListener('click', beforeLinkNavigation, true)
    navigation?.addEventListener('navigate', beforeHistoryNavigation)
    return () => {
      window.removeEventListener('beforeunload', beforeunload)
      document.removeEventListener('click', beforeLinkNavigation, true)
      navigation?.removeEventListener('navigate', beforeHistoryNavigation)
    }
  }, [active])

  useEffect(() => {
    if (destination && !dialog.current?.open) dialog.current?.showModal()
    if (!destination && dialog.current?.open) dialog.current.close()
  }, [destination])

  return <>
    {children}
    <dialog ref={dialog} onCancel={() => setDestination(null)} aria-labelledby="mbti-leave-title" aria-describedby="mbti-leave-description" className="w-[calc(100%-32px)] max-w-sm rounded-2xl border border-boot-hairline bg-white p-5 text-boot-ink shadow-xl backdrop:bg-black/40">
      <h2 id="mbti-leave-title" className="text-lg font-black">입력 중인 경험을 두고 나갈까요?</h2>
      <p id="mbti-leave-description" className="mt-3 text-sm font-bold leading-6 text-boot-body">아직 저장하지 않은 응답은 이 화면에만 있어요. 다른 페이지로 이동하면 사라집니다.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" autoFocus onClick={() => setDestination(null)} className="min-h-12 rounded-xl bg-boot-primary px-3 text-sm font-black text-white">계속 입력하기</button>
        <button type="button" onClick={() => { if (!destination) return; approvedExit.current = true; window.location.assign(destination) }} className="min-h-12 rounded-xl border border-boot-hairline px-3 text-sm font-black">저장하지 않고 나가기</button>
      </div>
    </dialog>
  </>
}
