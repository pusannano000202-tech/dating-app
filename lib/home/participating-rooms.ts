import type { SocialChatRoom, SocialRoomsResponse } from '../chat/social-rooms-contract'
import { myMeetupDetail, type MyMeetups } from './my-meetups'

export type HomeParticipatingRoom = SocialChatRoom & {
  capacity: number | null
  detail: string
  statusLabel: string
}

/** The authenticated chat list owns membership; the old home read only enriches matching rooms. */
export function homeParticipatingRooms(social: SocialRoomsResponse, mine: MyMeetups | null): HomeParticipatingRoom[] {
  const details = new Map((mine?.items ?? []).map(room => [
    `${room.kind === 'scheduled' ? 'meetup' : room.kind}:${room.id}`,
    room,
  ]))
  return social.rooms.map(room => {
    const detail = details.get(`${room.kind}:${room.id}`)
    return {
      ...room,
      activity_key: room.activity_key ?? detail?.activity_key,
      category: room.category ?? detail?.category,
      capacity: detail && detail.capacity >= room.member_count ? detail.capacity : null,
      detail: detail ? myMeetupDetail(detail)
        : room.kind === 'league_team' ? '우리 팀 대화와 경기 준비'
          : room.kind === 'league_match' ? '상대 팀과 경기 일정 확인'
            : '시간·장소는 방에서 확인해요',
      statusLabel: !room.writable ? '읽기 전용'
        : detail?.schedule_status === 'schedule_pending' ? '일정 정하는 중' : '참여 중',
    }
  })
}
