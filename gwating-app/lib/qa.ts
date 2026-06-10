/**
 * 총 질문 수를 남은 일수에 균등 분배. 나머지는 앞 날에 배분.
 * 예) distributeQuestions(5, 3) → [2, 2, 1]
 */
export function distributeQuestions(totalQuestions: number, daysLeft: number): number[] {
  const result: number[] = new Array(daysLeft).fill(0);
  const base = Math.floor(totalQuestions / daysLeft);
  const remainder = totalQuestions % daysLeft;
  for (let i = 0; i < daysLeft; i++) {
    result[i] = base + (i < remainder ? 1 : 0);
  }
  return result;
}

/**
 * 두 답변을 비교해 케미 코멘트 생성.
 */
export function getChemistryComment(myAnswer: string, theirAnswer: string): string {
  if (myAnswer === theirAnswer) {
    return `둘 다 같은 답변을 골랐어요 — 취향이 딱 맞네요! 😄`;
  }
  return `서로 다른 스타일이에요. 만나서 직접 이야기해봐요 😊`;
}

/**
 * 오늘 답변해야 할 팀원 인덱스 반환 (round-robin).
 */
export function getTodayMemberIndex(dayNumber: number, teamSize: number): number {
  return (dayNumber - 1) % teamSize;
}
