/**
 * 두 배열의 교집합 중 가장 앞의 항목 반환. 없으면 null.
 * 날짜("YYYY-MM-DD")와 시간("HH:MM") 문자열 모두 지원.
 */
export function getEarliestIntersection(
  listA: string[],
  listB: string[]
): string | null {
  const setB = new Set(listB);
  const intersection = listA.filter((item) => setB.has(item)).sort();
  return intersection.length > 0 ? intersection[0] : null;
}
