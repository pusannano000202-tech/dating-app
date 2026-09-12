import {leagueInviteNotificationPresentation} from './league-invite-presentation'
import {continuationNotificationPresentation} from './continuation-presentation'
import type {NotificationRow} from './common-contract'

const domainLabels:Record<string,string>={league:'우리 학교 리그',meetup:'모임',activity_room:'함께할 모임',study_room:'스터디',mentoring:'멘토링'}
function joinedCandidateRoomTitle(value:unknown):string {
 const title=typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,'').trim().slice(0,80):''
 return !title||/(https?:\/\/|www\.|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|instagram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)/i.test(title)||title.replace(/\D/g,'').length>=7?'선택한 모임':title
}
const eventTitles:Record<string,string>={participation_ended:'참여가 종료됐어요',application_received:'새 참가 신청이 왔어요',application_accepted:'참가 신청이 승인됐어요',application_declined:'참가 신청 결과가 도착했어요',invitation_received:'함께하자는 초대가 왔어요',invitation_accepted:'친구가 초대를 수락했어요',invitation_declined:'친구가 초대를 거절했어요',member_joined:'새 멤버가 함께해요',member_left:'빈자리가 생겼어요',room_ready:'모두 모였어요'}
export function notificationPresentation(row:NotificationRow){
 const p=row.payload
 if(row.kind==='social_chat_message')return {context:null,title:'새 메시지가 도착했어요',summary:'참여 중인 대화에서 확인해 주세요.',label:'채팅',action:'대화 확인',href:null,requiresAction:false}
 if(row.kind==='social_activity'){
 const event=typeof p.event==='string'?p.event:''
  if(p.entity_type==='candidate_join_result'){
   if(event==='candidate_joined')return {context:null,title:'합류가 확정됐어요',summary:joinedCandidateRoomTitle(p.room_title)+'에 합류했어요. 다른 참가 제안은 종료됐어요.',label:'합류 대기판',action:'참여 상태 확인',href:null,requiresAction:false}
   if(event==='candidate_recruitment_closed')return {context:null,title:'초대한 사람의 모집이 종료됐어요',summary:'초대한 사람의 모집이 종료됐어요. 다른 대기자를 찾아보세요.',label:'합류 대기판',action:'다른 대기자 보기',href:null,requiresAction:false}
   return {context:null,title:'합류 대기 소식이 도착했어요',summary:'현재 합류 대기 상태를 확인해 주세요.',label:'합류 대기판',action:'현재 상태 확인',href:null,requiresAction:false}
  }
  if(p.entity_type==='candidate_invite')return {context:null,title:event==='invitation_received'?'함께하자는 초대가 왔어요':event==='invitation_accepted'?'초대의 진행 상태가 바뀌었어요':event==='invitation_declined'?'초대 응답이 도착했어요':'합류 대기 소식이 도착했어요',summary:'합류 대기판에서 현재 초대와 참여 상태를 확인해 주세요.',label:'합류 대기판',action:event==='invitation_received'?'초대 확인하기':'현재 상태 확인',href:null,requiresAction:event==='invitation_received'}
  if(event==='application_notice')return {context:null,title:'우리 모임에 새 신청이 왔어요',summary:'모임 채팅에서 모집 소식을 확인해 주세요. 참가 수락은 방장이 결정해요.',label:'모임',action:'모임 채팅으로',href:null,requiresAction:false}
  return {context:typeof p.context_label==='string'?p.context_label.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80):null,title:eventTitles[event]??'모임 소식이 도착했어요',summary:typeof p.body==='string'?p.body.slice(0,300):'현재 참여 상태를 확인해 주세요.',label:domainLabels[String(p.domain)]??'모임 안내',action:event==='application_received'?'신청 검토하기':event==='invitation_received'?'초대 확인하기':'현재 상태 확인',href:null,requiresAction:['application_received','invitation_received'].includes(event)}
 }
 return {title:kindLabel(row.kind,p,p.match_mode==='solo'||p.opp_group_size===1),summary:kindSummary(row.kind,p),label:row.kind==='department_league_invite'?'우리 학교 리그':'퀀텀 안내',action:'확인하기',href:getNotificationHref(row.kind,typeof p.match_id==='string'?p.match_id:null,p),requiresAction:row.kind==='department_league_invite'&&p.status==='pending'}
}
export function notificationTime(value:string){
 const time=new Date(value)
 return Number.isFinite(time.getTime())?new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(time):'시간 확인 중'
}

function kindLabel(kind: string, payload: Record<string, unknown>, isSolo = false): string {
  const leagueInvite = leagueInviteNotificationPresentation(kind, payload)
  if (leagueInvite) return leagueInvite.title
  if (kind === 'community_voice') return '참여한 보이스방의 일정이 바뀌었어요'
  const continuation = continuationNotificationPresentation(kind, payload)
  if (continuation) return continuation.title
  if (kind === 'campus_seven_guide') {
    return typeof payload.title === 'string' ? payload.title : '새 안내가 도착했어요'
  }
  if (kind === 'daily_card_available') return '오늘의 데일리카드를 열어보세요!'
  if (kind === 'tonight_journey') {
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : ''
    return ({
      allocation_published: '오늘밤 팀이 편성됐어요',
      deposit_due: '보증금 결제 마감이 가까워요',
      partner_acceptance_due: '방문 팀 수락을 확인해 주세요',
      venue_revealed: '오늘밤 장소 안내가 열렸어요',
      arrival_due: '오늘밤 도착 확인 시간이 다가와요',
      push_resubscribe_required: '이 기기의 오늘밤 알림을 다시 켜주세요',
    } as Record<string, string>)[eventType] ?? '오늘밤 새 안내가 도착했어요'
  }
  switch (kind) {
    case 'match_created': return isSolo ? '1:1 가매칭이 도착했어요!' : '새 가매칭이 도착했어요!'
    case 'match_confirmed': return '매칭이 확정되었습니다. 축하합니다!'
    case 'match_completed': return '만남이 완료되었어요'
    case 'phone_revealed': return '상대 연락처가 공개됐어요'
    case 'review_request': return '평가를 작성해주세요'
    case 'friend_request_received': return '친구 요청이 도착했어요'
    case 'quantum_event_room_invite': return '같은 방 초대가 도착했어요'
    case 'meeting_reminder': return '약속이 다가오고 있어요'
    case 'continuation_choice_request': return '이 만남, 이어갈래요?'
    case 'both_continue': return '양쪽 모두 이어가기 선택'
    case 'partner_paid_zero': return '보증금 정산'
    case 'refund_processed': return '환불 완료'
    case 'attendance_confirmed': return '출석 확인됨'
    case 'no_show_confirmed': return '노쇼 확정'
    case 'couple_party_invite': return '커플 더블데이트 초대가 도착했어요'
    case 'couple_party_accepted': return '파트너가 더블데이트 초대를 수락했어요'
    case 'couple_party_matched': return '함께할 다른 커플을 찾았어요'
    case 'couple_party_completed': return '더블데이트가 마무리됐어요'
    default: return '알림'
  }
}

function kindSummary(kind: string, payload: Record<string, unknown>): string {
  const leagueInvite = leagueInviteNotificationPresentation(kind, payload)
  if (leagueInvite) return leagueInvite.summary
  if (kind === 'community_voice') return '변경된 시간과 모집 상태를 확인해 주세요. 새 일정에는 직접 다시 참여해야 해요.'
  const continuation = continuationNotificationPresentation(kind, payload)
  if (continuation) return continuation.summary
  if (kind === 'campus_seven_guide') {
    return typeof payload.body === 'string' ? payload.body : 'Campus Seven LIVE 화면에서 확인해 주세요.'
  }
  if (kind === 'daily_card_available') {
    return '16시부터 20시 사이에 하루 한 장을 직접 열 수 있어요. 내가 열어야 상대 힌트가 보여요.'
  }
  if (kind === 'tonight_journey') {
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : ''
    return ({
      allocation_published: '팀 편성과 다음 결제 행동을 오늘밤 화면에서 확인해 주세요.',
      deposit_due: '미결제 상태라면 마감 전에 보증금 결제를 완료해 주세요.',
      partner_acceptance_due: '배정 인원 전원의 결제가 끝난 팀을 업장 화면에서 수락해 주세요.',
      venue_revealed: '공개 시각 이후 오늘밤 화면에서 정확한 장소와 이동 안내를 확인해 주세요.',
      arrival_due: '현장에 도착하면 오늘밤 화면에서 도착 확인을 진행해 주세요.',
      push_resubscribe_required: '브라우저 푸시 연결이 만료됐어요. 오늘밤 화면의 알림 설정에서 다시 켜 주세요.',
    } as Record<string, string>)[eventType] ?? '이름·연락처·정확한 주소는 알림에 포함하지 않아요.'
  }

  switch (kind) {
    case 'match_created':
      return '상대 상세는 확정 후 열려요. 먼저 사전 카드와 보증금을 확인해주세요.'
    case 'match_confirmed':
      return '약속 정보와 오늘의 카드를 확인하세요.'
    case 'match_completed':
      return '평가 작성과 환불 정산으로 이어져요.'
    case 'phone_revealed':
      return '약속 시간이 가까워져 상대 연락처가 공개됐어요.'
    case 'review_request':
      return '5점 별점과 한 줄 후기를 남겨주세요.'
    case 'friend_request_received':
      return '받은 요청을 친구 목록에서 확인하세요.'
    case 'quantum_event_room_invite': {
      const inviter = typeof payload.inviter_display_name === 'string'
        ? payload.inviter_display_name
        : '친구'
      const room = typeof payload.room_label === 'string' ? ` ${payload.room_label}` : ''
      return `${inviter}님이${room}에 같이 가자고 초대했어요. 자리는 15분 동안 예약돼요.`
    }
    case 'meeting_reminder':
      return '오늘 만남 시간과 장소를 다시 확인해주세요.'
    case 'continuation_choice_request':
      return '이어갈지 선택해주세요. 둘 다 이어가면 정산 화면이 열려요.'
    case 'both_continue':
      return '양쪽 모두 이어가기를 선택했어요. 환불/정산을 진행해주세요.'
    case 'partner_paid_zero': {
      const reasons = Array.isArray(payload?.reasons) ? payload.reasons.join(', ') : ''
      return reasons ? `사유: ${reasons}` : '상대가 앱 기여금을 0원으로 선택했어요.'
    }
    case 'refund_processed': {
      const amt = typeof payload?.refund_amount === 'number' ? payload.refund_amount : 0
      return amt > 0 ? `${amt.toLocaleString()}원 환불 완료.` : '환불 없이 보증금 정산이 완료됐어요.'
    }
    case 'attendance_confirmed': {
      const pool = typeof payload?.forfeited_pool === 'number' ? payload.forfeited_pool : 0
      const ns = typeof payload?.no_show_count === 'number' ? payload.no_show_count : 0
      return ns > 0
        ? `노쇼 ${ns}명, ${pool.toLocaleString()}원 분배 받음.`
        : '양쪽 모두 출석 확인.'
    }
    case 'no_show_confirmed':
      return '약속 장소에 오지 않은 기록이 남았어요. 보증금 환불이 제한될 수 있어요.'
    case 'couple_party_invite':
      return '내 파트너가 보낸 초대를 확인하고 커플팀을 완성해 주세요.'
    case 'couple_party_accepted':
      return '두 사람이 한 팀이 됐어요. 함께할 다른 커플을 찾고 있어요.'
    case 'couple_party_matched':
      return '상대 프로필은 숨긴 채 시간과 장소만 확인할 수 있어요.'
    case 'couple_party_completed':
      return '만남이 끝났어요. 계속 이야기하고 싶다면 친구 초대를 보내고 서로 수락해 주세요.'
    default:
      return ''
  }
}

function getNotificationHref(kind: string, matchId: string | null, payload: Record<string, unknown>) {
  const leagueInvite = leagueInviteNotificationPresentation(kind, payload)
  if (leagueInvite) return leagueInvite.href
  if (kind === 'community_voice') {
    const id = typeof payload.roomId === 'string' ? payload.roomId : ''
    return /^[0-9a-f-]{36}$/i.test(id) ? `/community/voice/rooms/${id}` : '/community/voice'
  }
  const continuation = continuationNotificationPresentation(kind, payload)
  if (continuation) return continuation.href
  if (kind === 'tonight_journey') {
    return payload.audience === 'partner' ? '/partner/tonight' : '/tonight'
  }
  if (kind === 'campus_seven_guide') return '/match/campus-seven'
  if (kind === 'quantum_event_room_invite') {
    const token = typeof payload.token === 'string' ? payload.token : ''
    return token ? `/match/invite/${encodeURIComponent(token)}` : '/match'
  }
  if (kind === 'couple_party_invite' || kind === 'couple_party_accepted' || kind === 'couple_party_matched' || kind === 'couple_party_completed') {
    const partyId = typeof payload.party_id === 'string' ? payload.party_id : ''
    return `/match/couples/double-date${partyId ? `?party=${encodeURIComponent(partyId)}` : ''}`
  }
  if (kind === 'friend_request_received') return '/friends'
  if (!matchId) return '/match'
  if (kind === 'review_request') return `/match/${encodeURIComponent(matchId)}/review`
  if (kind === 'continuation_choice_request') return `/match/${encodeURIComponent(matchId)}/continuation`
  return `/match/${encodeURIComponent(matchId)}`
}
