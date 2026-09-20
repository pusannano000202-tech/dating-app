import type { CalendarAudience, CalendarEvent, EventCalendarResponse } from './event-calendar'

/** Non-production screen fixtures, never sent to an admission/payment endpoint. */
export function calendarPreview(month: string, audience: CalendarAudience): EventCalendarResponse {
  const event: CalendarEvent = {
    id:'b87a1da9-1f30-477d-9c9a-9a98d419a995',audience,
    title:audience === 'couple' ? '커플 보드게임 데이' : '보드게임 데이',
    summary:audience === 'couple' ? '내 연인과 함께, 새로운 커플과 웃으며 게임을 즐겨요.' : '처음 만난 친구들과 가볍게 게임하고, 편하게 이야기를 나눠요.',
    imageUrl:'/images/match/calendar-play-20260915.webp',
    startsAt:`${month}-20T06:00:00.000Z`,endsAt:`${month}-20T08:00:00.000Z`,applicationClosesAt:`${month}-19T09:00:00.000Z`,
    locationName:'부산대 앞 보드게임 카페 · 예시 장소',depositAmountKrw:10000,
    applicantCount:audience === 'couple' ? 12 : 30,status:'recruiting',myApplication:null,checkoutEnabled:false,depositPolicyStatus:'not_connected',
  }
  return {serverNow:`${month}-15T03:00:00.000Z`,relationshipStatus:audience === 'couple' ? 'in_relationship' : 'single',events:[event]}
}
