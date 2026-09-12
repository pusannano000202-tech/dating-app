'use client'
import Link from 'next/link'
import {ArrowRight,RefreshCw,ShieldCheck} from 'lucide-react'
import {isSupabaseConfigured} from '@/lib/utils'
import s from './hosted-rooms.module.css'

export type HostedRoomCardData={id:string;title:string;label:string;count:number;capacity:number;joined:boolean;isHost:boolean;closed:boolean;href:string;roles?:{mentor:number;mentee:number;size:number};legacy?:boolean;needsAttention?:boolean}
export function HostedRoomCard({room:r}:{room:HostedRoomCardData}){
 if(r.needsAttention)return <article className={s.room}><div className={s.roomBody}><span className={s.badge}>참여 상태 확인 필요</span><h3>{r.title}</h3><p className={s.note}>현재 대화에 접근할 수 없어요. 내 참여 상태를 확인하고 신고·나가기를 진행할 수 있어요.</p></div><div className={s.roomFoot}><small>다른 사람의 정보와 대화는 표시하지 않아요.</small><Link className={s.button} href={r.href}>참여 관리<ArrowRight size={16}/></Link></div></article>
 return <article className={s.room}><div className={s.roomBody}><div className={s.row}><span className={s.badge}>{r.isHost?'내가 연 모임':r.joined?'참여 중':r.closed?'모집 마감':'함께할 사람을 기다려요'}</span><span className={s.count}>{r.count}<small> / {r.capacity}명</small></span></div><h3>{r.title}</h3><p className={s.note}>{r.label}</p>{r.roles?<div className={s.roleCounts}><span>경험 나눔 <b>{r.roles.mentor}/{r.roles.size}</b></span><span>도움 구함 <b>{r.roles.mentee}/{r.roles.size}</b></span></div>:<div className={s.slots} aria-label={`${r.capacity}자리 중 ${r.count}명 참여`}>{Array.from({length:r.capacity},(_,i)=><span key={i} className={`${s.slot} ${i<r.count?s.filled:''}`}/>)}</div>}</div><div className={s.roomFoot}><small>{r.joined?'이전 대화와 약속은 그대로':<><ShieldCheck size={13} className="mr-1 inline"/>보증금 확인 후 신청<br/>방장 수락 시 채팅 입장</>}</small>{r.closed&&!r.joined?<span className={s.badge}>빈자리를 기다려 주세요</span>:<Link className={s.button} href={r.href}>{r.joined?'모임 이어가기':'방 살펴보기'}<ArrowRight size={16}/></Link>}</div></article>
}
export function HostedConnection({account,error,loading,onRetry}:{account:string|null|undefined;error:string;loading:boolean;onRetry:()=>void}){
 if(!isSupabaseConfigured())return <aside className={s.error} role="status"><b>모집 서비스 연결을 준비 중이에요.</b><p>로그인·모집 서버가 연결되지 않았어요. 화면은 살펴볼 수 있지만 실제 방 생성·신청은 하지 않아요.</p><button onClick={onRetry}><RefreshCw size={14}/>연결 다시 확인</button></aside>
 if(account===undefined&&!error)return <p className={s.status} role="status">내 학교와 모임을 확인하고 있어요…</p>
 if(account===null)return <aside className={s.error} role="status">로그인하면 같은 과의 실제 모집방을 볼 수 있어요.<br/><Link href="/login?redirect=%2Fmeetups%2Fdepartment">로그인하기</Link></aside>
 if(account==='unavailable'||error)return <aside className={s.error} role="alert"><b>모집 연결을 확인하지 못했어요.</b><p>{error==='already_active'?'이미 참여 중인 멘토링이 있어요. 기존 모임을 먼저 확인해 주세요.':error==='profile_required'||error==='department_identity_required'?'학교와 학과 정보가 필요해요.':error==='conflict'?'방 상태가 바뀌었어요. 다시 확인한 뒤 진행해 주세요.':'실제 계정·모집 서버가 연결되기 전에는 빈 방이나 신청 완료로 표시하지 않아요.'}</p><button onClick={onRetry}><RefreshCw size={14}/>다시 확인</button>{['profile_required','department_identity_required'].includes(error)?<Link href="/profile/edit">학교·학과 확인</Link>:null}</aside>
 return loading?<p className={s.status} role="status">모집 현황을 확인하고 있어요…</p>:null
}
