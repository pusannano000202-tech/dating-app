'use client'

import { createChatPollOfflineTransport } from '@/lib/chat-polls/offline-fixture'
import ActivityRoomPolls from './ActivityRoomPolls'
import ChatComposerActions from './ChatComposerActions'
import { useState } from 'react'
import { ArrowLeft, ChevronRight, Send, Users } from 'lucide-react'
import Link from 'next/link'
import styles from './chat-poll-preview.module.css'

const fixture = createChatPollOfflineTransport({ empty: true })

export default function ChatPollOfflineFixture() {
  const transport = fixture.transport
  const [composerRequest, setComposerRequest] = useState(0)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  return <main className={styles.page}>
    <div className={styles.previewNotice}>디자인 검수 · 예시 채팅 · 실제 연결 없음</div>
    <div className={styles.phone}>
      <header className={styles.header}>
        <Link href="/community" aria-label="커뮤니티로 돌아가기"><ArrowLeft size={21}/></Link>
        <div><h1>수업 끝나고, 커피 한 잔</h1><p><Users size={12}/> 예시 4명 · 오늘의 별명으로</p></div>
      </header>
      <div className={styles.intro}><span>약속을 정하는 중</span><p>서로 편한 시간과 장소를 골라봐요.<ChevronRight size={15}/></p></div>
      <div className={styles.messages} aria-label="예시 대화" role="log">
        <p className={styles.date}>오늘의 대화</p>
        <article className={styles.message}><span className={styles.avatar}><Users size={20}/></span><div><p className={styles.author}>바다거북 · 예시</p><p className={styles.bubble}>수업 끝나고 잠깐 만날까요?</p><time>오후 1:05</time></div></article>
        <article className={styles.mine}><p className={styles.bubble}>좋아요! 다들 어디가 편해요?</p><time>오후 1:06</time></article>
        <article className={styles.message}><span className={`${styles.avatar} ${styles.avatarSand}`}><Users size={20}/></span><div><p className={styles.author}>구름냥 · 예시</p><p className={styles.bubble}>메뉴도 같이 골라봐요.<br/>투표 하나 올려주실 분?</p><time>오후 1:07</time></div></article>
        {messages.map((text,index)=><article className={styles.mine} key={index}><p className={styles.bubble}>{text}</p><span className={styles.localOnly}>내 화면에만 보이는 예시</span></article>)}
      </div>
      <div className={styles.polls}><ActivityRoomPolls roomId={fixture.roomId} transport={transport} composerRequest={composerRequest} /></div>
      <form className={styles.composer} onSubmit={event=>{event.preventDefault();if(message.trim()){setMessages(current=>[...current,message.trim()]);setMessage('')}}}>
        <ChatComposerActions onCreatePoll={()=>setComposerRequest(value=>value+1)}/>
        <input aria-label="예시 메시지 입력" value={message} maxLength={1000} onChange={event=>setMessage(event.target.value)} placeholder="메시지를 입력하세요"/>
        <button className={styles.send} type="submit" disabled={!message.trim()} aria-label="예시 메시지 보내기"><Send size={18}/></button>
      </form>
      <p className={styles.help}>입력창 옆 <strong>+</strong> → 투표 만들기<br/><span>실제 투표가 아니며 저장되지 않아요.</span></p>
    </div>
  </main>
}
