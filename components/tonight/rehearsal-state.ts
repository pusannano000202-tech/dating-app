export const REHEARSAL_STAGES = [
  { id: 'application', time: '17:30', label: '사진 순위 신청', requirement: null },
  { id: 'allocation', time: '18:32', label: '팀 편성', requirement: '신청 마감과 팀 편성이 먼저 완료돼야 해요.' },
  { id: 'deposit', time: '18:45', label: '보증금 마감', requirement: '팀 편성과 사용자 확인이 먼저 완료돼야 해요.' },
  { id: 'partner', time: '18:50', label: '업장 수락', requirement: '배정된 팀원 전원의 보증금이 모두 확인돼야 해요.' },
  { id: 'reveal', time: '18:55', label: '팀·장소 공개', requirement: '팀원 전원의 보증금과 업장 수락이 먼저 완료돼야 해요.' },
  { id: 'arrival', time: '19:20', label: '도착 확인', requirement: '팀 번호와 정확한 업장·주소 공개가 먼저 완료돼야 해요.' },
  { id: 'start', time: '19:30', label: '모임 시작', requirement: '도착 확인과 모임 시작 상태가 먼저 완료돼야 해요.' },
  { id: 'service', time: '20:50', label: '실참석·정산', requirement: '활동 종료 시각이 지나야 실제 참석 인원과 정산 상태를 확인할 수 있어요.' },
] as const

export type RehearsalStageIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export function isRehearsalStageReady(stageIndex: number, readyThrough: number): boolean {
  return Number.isInteger(stageIndex)
    && stageIndex >= 0
    && stageIndex < REHEARSAL_STAGES.length
    && stageIndex <= readyThrough
}

export function getRehearsalBlockReason(stageIndex: number, readyThrough: number): string | null {
  if (isRehearsalStageReady(stageIndex, readyThrough)) return null
  return REHEARSAL_STAGES[stageIndex]?.requirement ?? '앞 단계의 준비가 먼저 필요해요.'
}
