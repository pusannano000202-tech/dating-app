const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const labels: Record<string, Record<string, string>> = {
  lol: {top:'TOP',jungle:'JUNGLE',mid:'MID',adc:'BOTTOM',support:'SUPPORT'},
  futsal: {gk:'골키퍼',ld:'왼쪽 수비',rd:'오른쪽 수비',lm:'왼쪽 미드필더',rm:'오른쪽 미드필더',st:'공격수'},
  football: {gk:'골키퍼',lb:'왼쪽 풀백',lcb:'왼쪽 중앙 수비',rcb:'오른쪽 중앙 수비',rb:'오른쪽 풀백',lcm:'왼쪽 중앙 미드필더',cm:'중앙 미드필더',rcm:'오른쪽 중앙 미드필더',lw:'왼쪽 윙',st:'공격수',rw:'오른쪽 윙'},
}
const terminal: Record<string, {title:string;summary:string}> = {
  accepted: {title:'팀 초대를 수락했어요',summary:'합류한 자리와 팀원들을 지도에서 확인하세요.'},
  declined: {title:'팀 초대를 거절했어요',summary:'참가 인원에 포함되지 않았어요. 다른 팀을 둘러볼 수 있어요.'},
  cancelled: {title:'팀 초대가 취소됐어요',summary:'취소된 초대로는 합류할 수 없어요. 최신 팀 상태를 확인하세요.'},
  expired: {title:'팀 초대가 만료됐어요',summary:'합류하고 싶다면 새 초대를 받아 주세요.'},
}

/** Never trust a stored href: rebuild this private destination from validated identifiers. */
export function leagueInviteNotificationPresentation(kind:string,payload:Record<string,unknown>): {href:string;title:string;summary:string}|null {
  if (kind !== 'department_league_invite') return null
  const {sport,slot,invite_id:inviteId,challenge_id:challengeId,status} = payload
  if (typeof sport !== 'string' || !Object.hasOwn(labels,sport)
    || typeof slot !== 'string' || !Object.hasOwn(labels[sport],slot)
    || typeof inviteId !== 'string' || !UUID.test(inviteId)
    || typeof challengeId !== 'string' || !UUID.test(challengeId)
    || typeof status !== 'string' || (status !== 'pending' && !Object.hasOwn(terminal,status))) {
    return {href:'/meetups/league',title:'팀 초대를 다시 확인해 주세요',summary:'리그의 받은 초대에서 최신 상태를 확인할 수 있어요.'}
  }
  const href = `/meetups/league?sport=${sport}&invite=${inviteId}&challenge=${challengeId}`
  if (status !== 'pending') return {href,...terminal[status]}
  const inviter = typeof payload.inviter_display_name === 'string' ? payload.inviter_display_name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,30) : ''
  return {href,title:`${inviter || '친구'}님이 ${labels[sport][slot]} 자리로 초대했어요`,summary:'팀 지도에서 초대 포지션을 확인하고, 내 실력을 선택하고 수락해 주세요.'}
}
