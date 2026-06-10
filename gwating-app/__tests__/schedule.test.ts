import { getEarliestIntersection } from "../lib/schedule";

describe("getEarliestIntersection", () => {
  test("겹치는 날짜 중 가장 빠른 날 반환", () => {
    const a = ["2025-06-10", "2025-06-11", "2025-06-13"];
    const b = ["2025-06-11", "2025-06-12", "2025-06-13"];
    expect(getEarliestIntersection(a, b)).toBe("2025-06-11");
  });

  test("겹치는 날 없으면 null 반환", () => {
    const a = ["2025-06-10", "2025-06-11"];
    const b = ["2025-06-12", "2025-06-13"];
    expect(getEarliestIntersection(a, b)).toBeNull();
  });

  test("빈 배열이면 null 반환", () => {
    expect(getEarliestIntersection([], ["2025-06-10"])).toBeNull();
  });

  test("시간 배열도 동일하게 동작", () => {
    const a = ["18:00", "19:00", "20:00"];
    const b = ["19:00", "20:00", "21:00"];
    expect(getEarliestIntersection(a, b)).toBe("19:00");
  });
});
