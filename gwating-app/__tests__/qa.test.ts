import { distributeQuestions, getChemistryComment } from "../lib/qa";

describe("distributeQuestions", () => {
  test("5문항 5일 → 하루 1개씩", () => {
    const result = distributeQuestions(5, 5);
    expect(result).toEqual([1, 1, 1, 1, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(5);
  });

  test("5문항 3일 → [2, 2, 1]", () => {
    const result = distributeQuestions(5, 3);
    expect(result).toEqual([2, 2, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(5);
  });

  test("5문항 1일 → [5]", () => {
    const result = distributeQuestions(5, 1);
    expect(result).toEqual([5]);
  });

  test("3문항 5일 → [1, 1, 1, 0, 0]", () => {
    const result = distributeQuestions(3, 5);
    expect(result.reduce((a, b) => a + b, 0)).toBe(3);
    expect(result.length).toBe(5);
  });
});

describe("getChemistryComment", () => {
  test("같은 답변 → 공통점 코멘트 반환", () => {
    const comment = getChemistryComment("바로 새 화제를 꺼낸다 🗣️", "바로 새 화제를 꺼낸다 🗣️");
    expect(typeof comment).toBe("string");
    expect(comment.length).toBeGreaterThan(0);
  });

  test("다른 답변 → 다름 코멘트 반환", () => {
    const comment = getChemistryComment("바로 새 화제를 꺼낸다 🗣️", "폰 만지며 버틴다 📱");
    expect(typeof comment).toBe("string");
    expect(comment.length).toBeGreaterThan(0);
  });
});
