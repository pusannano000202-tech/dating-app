/** Officially documented facilities, not live inventory or a reservation promise. */
export const STUDY_VENUE_SUGGESTIONS = [
  { id: 'pnu-central-group', name: '부산대 중앙도서관 그룹스터디룸', note: '도서관 공식 안내에서 인원·예약·이용 가능 여부를 확인한 뒤, 정확한 방 번호를 함께 정해요.' },
  { id: 'pnu-saebyeokbeol-group', name: '부산대 새벽벌도서관 그룹스터디룸', note: '도서관 공식 안내에서 인원·예약·이용 가능 여부를 확인한 뒤, 정확한 방 번호를 함께 정해요.' },
] as const
export const STUDY_VENUE_SOURCE = {
  url: 'https://lib.pusan.ac.kr/',
  reference: 'https://lib.pusan.ac.kr/wp-content/uploads/2025/02/250207_%EB%B6%80%EC%82%B0%EB%8C%80%EB%8F%84%EC%84%9C%EA%B4%80%EB%A6%AC%ED%94%8C%EB%A0%9B_%ED%9A%8C%EC%9B%90_%EC%88%98%EC%A0%95.pdf',
  checkedAt: '2026-09-10',
  note: '공식 안내의 시설 목록을 참고한 후보예요. 실시간 빈자리·현재 운영·요금은 연결되지 않았고 광고 제휴는 없어요.',
} as const
