# 부팅 — Plan 3: 매칭 후 플로우 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 자동 매칭 완료 화면, 날짜·시간 조율, 일정 확정, Q&A 순번제 일일 공개, 당일 팀장 채팅(skeleton) 5개 신규 페이지를 구현한다.

**Architecture:** 새 타입(`types/match-flow.ts`) → 유틸(`lib/qa.ts`, `lib/schedule.ts`) → 질문 데이터(`data/questions-by-mood.ts`) → 페이지 순으로 진행. 모든 상태는 localStorage에 저장(Supabase 연동 전 MVP). Plan 1, 2 완료 후 실행할 것.

**Tech Stack:** Next.js 14 (App Router), TypeScript, localStorage, Tailwind CSS v3

---

## 파일 맵

| 파일 | 작업 |
|------|------|
| `types/match-flow.ts` | 매칭 후 상태 타입 정의 |
| `data/questions-by-mood.ts` | 분위기별 Q&A 질문 세트 |
| `lib/qa.ts` | Q&A 분배 로직 + 케미 코멘트 생성 |
| `lib/schedule.ts` | 날짜·시간 intersection 로직 |
| `lib/storage.ts` | matchFlow 상태 save/load 추가 |
| `app/match/result/page.tsx` | 자동 매칭 완료 + 즉시 공개 |
| `app/match/schedule/page.tsx` | 날짜 선택 → 시간 선택 |
| `app/match/confirmed/page.tsx` | 일정 확정 + 카운트다운 |
| `app/match/qa/page.tsx` | Q&A 순번제 일일 공개 |
| `app/match/chat/page.tsx` | 당일 팀장 채팅 skeleton |
| `app/match/page.tsx` | /match/result 로 redirect |
| `__tests__/qa.test.ts` | Q&A 분배 로직 테스트 |
| `__tests__/schedule.test.ts` | 날짜 intersection 테스트 |

---

## Task 1: 타입 정의

**Files:**
- Create: `types/match-flow.ts`

- [x] **Step 1: 타입 파일 생성**

```ts
// types/match-flow.ts
import { TeamProfile, MoodKey, Gender } from "./matching";

export type MatchedTeamInfo = {
  teamName?: string;       // D-day까지 비공개
  school: string;
  ageRange: string;
  maleCount: number;
  femaleCount: number;
  mood: MoodKey;
};

export type ScheduleState = {
  availableDates: string[];   // "YYYY-MM-DD" 형식
  availableTimes: string[];   // "18:00", "19:00" 등
  confirmedDate?: string;
  confirmedTime?: string;
  venue?: string;             // skeleton: 추후 DB 연결
};

export type QAAnswer = {
  questionId: string;
  myAnswer: string;
  theirAnswer?: string;       // 상대방 제출 전엔 undefined
  memberId: string;           // 답변한 팀원 nickname
  theirMemberId?: string;
};

export type MatchFlowState = {
  matchId: string;
  score: number;
  matchedTeam: MatchedTeamInfo;
  schedule: ScheduleState;
  qaAnswers: QAAnswer[];
  currentQADay: number;
  currentRotationIndex: number;   // 오늘 순번 팀원 인덱스
};
```

- [x] **Step 2: 빌드 에러 없는지 확인**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 에러 없음

- [x] **Step 3: 커밋**

```bash
git add types/match-flow.ts
git commit -m "feat: add MatchFlowState types for post-match flow"
```

---

## Task 2: 분위기별 질문 데이터

**Files:**
- Create: `data/questions-by-mood.ts`

- [x] **Step 1: 질문 세트 생성**

```ts
// data/questions-by-mood.ts
import { MoodKey } from "@/types/matching";

export type QAQuestion = {
  id: string;
  text: string;
  choices: string[];
};

export const QUESTIONS_BY_MOOD: Record<MoodKey, QAQuestion[]> = {
  comfortableTalk: [
    {
      id: "ct-1",
      text: "과팅 자리에서 대화가 갑자기 끊겼을 때 당신의 행동은?",
      choices: ["바로 새 화제를 꺼낸다 🗣️", "잠깐 기다렸다가 슬쩍 말을 건다", "누군가 먼저 말하길 기다린다", "폰 만지며 버틴다 📱"],
    },
    {
      id: "ct-2",
      text: "처음 만나는 자리에서 가장 편한 화제는?",
      choices: ["학과·수업 얘기", "요즘 즐기는 것(취미·드라마·게임)", "공통 지인 찾기", "음식·맛집 얘기"],
    },
    {
      id: "ct-3",
      text: "과팅에서 절대 꺼내지 않을 주제는?",
      choices: ["전 연인 얘기", "정치·종교", "성적·학점", "돈·집안 얘기"],
    },
    {
      id: "ct-4",
      text: "대화가 잘 통한다고 느끼는 순간은?",
      choices: ["같은 포인트에서 웃을 때", "내 말을 잘 받아줄 때", "침묵이 어색하지 않을 때", "대화가 끊기지 않을 때"],
    },
    {
      id: "ct-5",
      text: "과팅 자리에서 나의 대화 스타일은?",
      choices: ["질문을 많이 하는 편", "내 얘기를 많이 하는 편", "듣는 편", "상황 봐가면서"],
    },
  ],
  activeSocial: [
    {
      id: "as-1",
      text: "과팅 당일 본인의 역할은?",
      choices: ["분위기 메이커 🔥", "대화 이어주기 🗣️", "조용히 분위기 파악", "그냥 즐기기 😄"],
    },
    {
      id: "as-2",
      text: "기억에 남는 사람의 첫인상 특징은?",
      choices: ["웃음이 많은 사람", "목소리가 좋은 사람", "눈을 잘 마주치는 사람", "리액션이 좋은 사람"],
    },
    {
      id: "as-3",
      text: "과팅 끝나고 연락하고 싶은 사람 유형은?",
      choices: ["나를 많이 웃겨준 사람", "내 말을 잘 들어준 사람", "공통점이 많았던 사람", "솔직하게 대화한 사람"],
    },
    {
      id: "as-4",
      text: "자리가 달아오를 때 내가 하는 행동은?",
      choices: ["더 신나서 분위기 올린다", "슬쩍 더 가까이 앉는다", "조용히 웃으면서 즐긴다", "사진 찍자고 제안한다"],
    },
    {
      id: "as-5",
      text: "과팅에서 가장 인상 깊은 게임이나 활동은?",
      choices: ["공통점 찾기 게임", "진실 혹은 도전", "밸런스 게임", "즉흥 롤플레이"],
    },
  ],
  gamesAndDrinks: [
    {
      id: "gd-1",
      text: "과팅 첫 게임으로 가장 하고 싶은 것은?",
      choices: ["밸런스 게임", "진실 혹은 도전", "369 게임", "카드 게임"],
    },
    {
      id: "gd-2",
      text: "술자리에서 나의 포지션은?",
      choices: ["게임 진행자 🎮", "술 권유하는 사람 🍻", "조용히 마시는 사람", "분위기 무드메이커"],
    },
    {
      id: "gd-3",
      text: "과팅 2차로 가장 가고 싶은 곳은?",
      choices: ["노래방 🎤", "포차·호프", "편의점 앞 🏪", "카페 ☕"],
    },
    {
      id: "gd-4",
      text: "벌칙이 걸렸을 때 나의 반응은?",
      choices: ["쿨하게 받아들인다", "은근 피하려 한다", "더 세게 건다", "웃으면서 넘어간다"],
    },
    {
      id: "gd-5",
      text: "술이 약한 편이면 과팅 자리에서 어떻게 하나요?",
      choices: ["솔직하게 말하고 음료로 대체", "조금씩 마시며 버틴다", "상황 보고 결정", "아예 안 마신다고 말함"],
    },
  ],
  respectfulSafe: [
    {
      id: "rs-1",
      text: "처음 만나는 자리에서 가장 불편한 상황은?",
      choices: ["지나친 신체 접촉", "무례한 농담", "과도한 음주 권유", "개인 정보 캐묻기"],
    },
    {
      id: "rs-2",
      text: "과팅 후 상대에게 연락할 때 나는?",
      choices: ["먼저 연락하는 편", "상대가 먼저 하길 기다림", "단체 카톡만 함", "자연스럽게 SNS 팔로우"],
    },
    {
      id: "rs-3",
      text: "편하지 않은 상대와 자리가 이어질 때는?",
      choices: ["솔직하게 말하고 자리를 정리함", "억지로 맞춰가며 버팀", "화장실 핑계로 자리 이동", "친한 팀원에게 도움 요청"],
    },
    {
      id: "rs-4",
      text: "좋은 과팅이었다고 느끼는 기준은?",
      choices: ["서로 존중받는 느낌", "웃음이 많았을 때", "대화가 자연스러울 때", "2차까지 이어졌을 때"],
    },
    {
      id: "rs-5",
      text: "첫 만남에서 가장 중요하게 보는 것은?",
      choices: ["매너와 배려", "유머 감각", "외모·첫인상", "대화 주제와 깊이"],
    },
  ],
  naturalIntro: [
    {
      id: "ni-1",
      text: "소개팅과 과팅의 가장 큰 차이는 뭐라고 생각하나요?",
      choices: ["부담감이 달라요", "친해지는 속도가 달라요", "설레는 포인트가 달라요", "그냥 인원 차이 아닌가요?"],
    },
    {
      id: "ni-2",
      text: "자연스러운 만남에서 내가 가장 편한 순간은?",
      choices: ["1:1로 잠깐 얘기할 때", "단체로 같이 웃을 때", "이동하면서 걸을 때", "헤어지기 직전 인사할 때"],
    },
    {
      id: "ni-3",
      text: "첫 인상에서 가장 중요하게 보는 것은?",
      choices: ["눈빛·표정", "목소리·말투", "전체적인 분위기", "옷차림"],
    },
    {
      id: "ni-4",
      text: "과팅 자리에서 호감을 표현하는 나만의 방식은?",
      choices: ["말을 많이 걸기", "자꾸 웃어주기", "무의식적으로 가까이 앉기", "공통점 찾아서 공감하기"],
    },
    {
      id: "ni-5",
      text: "만남 이후 자연스럽게 연락이 이어지려면?",
      choices: ["당일 바로 연락", "다음날 가볍게 안부", "SNS 맞팔 후 자연스럽게", "상대가 먼저 하면 받아줌"],
    },
  ],
};
```

- [x] **Step 2: 커밋**

```bash
git add data/questions-by-mood.ts
git commit -m "feat: add Q&A question sets per mood (5 questions × 5 moods)"
```

---

## Task 3: Q&A 분배 로직 + 케미 코멘트

**Files:**
- Create: `lib/qa.ts`
- Create: `__tests__/qa.test.ts`

- [x] **Step 1: 테스트 먼저 작성**

```ts
// __tests__/qa.test.ts
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
```

- [x] **Step 2: 테스트 실패 확인**

```bash
npm test -- --testPathPattern="qa" 2>&1 | tail -10
```

Expected: FAIL

- [x] **Step 3: 구현**

```ts
// lib/qa.ts

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
    return `둘 다 "${myAnswer.replace(/\s*[🔥🎯🤍✨🗣️📱😄🎮🍻🎤☕💬]/gu, "").trim()}" — 취향이 딱 맞네요! 😄`;
  }
  return `서로 다른 스타일이에요. 만나서 직접 이야기해봐요 😊`;
}

/**
 * 오늘 답변해야 할 팀원 인덱스 반환 (round-robin).
 */
export function getTodayMemberIndex(dayNumber: number, teamSize: number): number {
  return (dayNumber - 1) % teamSize;
}
```

- [x] **Step 4: 테스트 통과 확인**

```bash
npm test -- --testPathPattern="qa" 2>&1 | tail -10
```

Expected: PASS

- [x] **Step 5: 커밋**

```bash
git add lib/qa.ts __tests__/qa.test.ts
git commit -m "feat: add Q&A distribution logic and chemistry comment generator"
```

---

## Task 4: 날짜·시간 intersection 로직

**Files:**
- Create: `lib/schedule.ts`
- Create: `__tests__/schedule.test.ts`

- [x] **Step 1: 테스트 먼저 작성**

```ts
// __tests__/schedule.test.ts
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
```

- [x] **Step 2: 테스트 실패 확인**

```bash
npm test -- --testPathPattern="schedule" 2>&1 | tail -10
```

Expected: FAIL

- [x] **Step 3: 구현**

```ts
// lib/schedule.ts

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
```

- [x] **Step 4: 테스트 통과 확인**

```bash
npm test -- --testPathPattern="schedule" 2>&1 | tail -10
```

Expected: PASS

- [x] **Step 5: 커밋**

```bash
git add lib/schedule.ts __tests__/schedule.test.ts
git commit -m "feat: add schedule intersection logic"
```

---

## Task 5: Storage — matchFlow 추가

**Files:**
- Modify: `lib/storage.ts`

- [x] **Step 1: matchFlow save/load 함수 추가**

`lib/storage.ts` 파일 끝에 추가:

```ts
// lib/storage.ts 에 추가
import { MatchFlowState } from "@/types/match-flow";

export function saveMatchFlow(state: MatchFlowState): void {
  localStorage.setItem("matchFlow", JSON.stringify(state));
}

export function loadMatchFlow(): MatchFlowState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("matchFlow");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MatchFlowState;
  } catch {
    return null;
  }
}

export function clearMatchFlow(): void {
  localStorage.removeItem("matchFlow");
}
```

- [x] **Step 2: 커밋**

```bash
git add lib/storage.ts
git commit -m "feat: add matchFlow save/load to storage"
```

---

## Task 6: 매칭 완료 페이지

**Files:**
- Create: `app/match/result/page.tsx`
- Modify: `app/match/page.tsx`

- [x] **Step 1: result 페이지 생성**

```tsx
// app/match/result/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadTeam } from "@/lib/storage";
import { saveMatchFlow } from "@/lib/storage";
import { rankTeams } from "@/lib/matching";
import { mockTeams } from "@/data/mockTeams";
import { TeamProfile } from "@/types/matching";
import { MatchFlowState } from "@/types/match-flow";

export default function MatchResultPage() {
  const router = useRouter();
  const [myTeam, setMyTeam] = useState<TeamProfile | null>(null);
  const [score, setScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const team = loadTeam();
    if (!team) { setLoading(false); return; }
    setMyTeam(team);
    const results = rankTeams(team, mockTeams);
    if (results.length === 0) { setLoading(false); return; }
    const best = results[0];
    setScore(best.score);

    const state: MatchFlowState = {
      matchId: `match-${Date.now()}`,
      score: best.score,
      matchedTeam: {
        school: best.team.school,
        ageRange: best.team.ageRange,
        maleCount: best.team.maleCount ?? 0,
        femaleCount: best.team.femaleCount ?? 0,
        mood: best.team.mood,
      },
      schedule: { availableDates: [], availableTimes: [] },
      qaAnswers: [],
      currentQADay: 1,
      currentRotationIndex: 0,
    };
    saveMatchFlow(state);
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!myTeam) {
    return (
      <>
        <AppHeader />
        <main className="py-20 px-4 text-center max-w-[480px] mx-auto">
          <p className="text-body mb-6">팀 정보가 없어요. 팀을 먼저 만들어주세요.</p>
          <Button onClick={() => router.push("/team/create")}>팀 만들러 가기</Button>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto flex flex-col items-center text-center gap-6">
          {/* 축하 */}
          <div>
            <div className="text-[44px] mb-3">🎉</div>
            <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">매칭됐어요!</h1>
            <p className="text-sm text-muted">딱 맞는 팀을 찾았어요</p>
          </div>

          {/* 점수 링 */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary-soft to-[#ffe4ed] border-[3px] border-primary-disabled flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(255,90,111,0.15)]">
            <span className="text-3xl font-black text-primary leading-none tracking-[-1px]">{score}%</span>
            <span className="text-[10px] font-bold text-primary mt-0.5">궁합 점수</span>
          </div>

          {/* 즉시 공개 */}
          <div className="w-full">
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-3">상대팀 기본 정보</p>
            <div className="flex flex-col gap-2">
              {[
                { icon: "🎓", label: "학과", value: "경영학과" },
                { icon: "🎂", label: "나이대", value: "22~24세" },
              ].map(({ icon, label, value }) => (
                <div key={label} className="bg-surface-soft rounded-[12px] px-4 py-3 flex items-center gap-3 text-left">
                  <span className="text-lg w-6 text-center">{icon}</span>
                  <div>
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wide">{label}</div>
                    <div className="text-sm font-black text-ink">{value}</div>
                  </div>
                </div>
              ))}
              <div className="bg-surface-soft rounded-[12px] px-4 py-3 flex items-center gap-3 text-left">
                <span className="text-lg w-6 text-center">👥</span>
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wide">성별 구성</div>
                  <div className="flex gap-1.5 mt-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary-disabled">여 2명</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#f0f5ff] text-[#4f9eff] border border-[#cce0ff]">남 1명</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 잠금 힌트 */}
          <div className="w-full bg-surface-soft rounded-[12px] p-4 text-sm text-muted text-left leading-relaxed">
            <span className="font-bold text-ink">🔒 상대팀 이름은 아직 비공개예요</span><br />
            날짜를 정하고, 만남 전까지 하루씩 Q&A로 알아가요!
          </div>

          <Button fullWidth onClick={() => router.push("/match/schedule")}>
            만날 날짜 정하러 가기 →
          </Button>
        </div>
      </main>
    </>
  );
}
```

- [x] **Step 2: 기존 match/page.tsx를 result로 redirect**

```tsx
// app/match/page.tsx
import { redirect } from "next/navigation";

export default function MatchPage() {
  redirect("/match/result");
}
```

- [x] **Step 3: 브라우저 확인**

팀 만든 뒤 `http://localhost:3000/match` → `/match/result`로 리다이렉트 → 점수 링 + 즉시 공개 카드 3개 확인

- [x] **Step 4: 커밋**

```bash
git add app/match/result/page.tsx app/match/page.tsx
git commit -m "feat: add match result page with score ring and instant reveal"
```

---

## Task 7: 날짜·시간 조율 페이지

**Files:**
- Create: `app/match/schedule/page.tsx`

- [x] **Step 1: 달력 + 시간 선택 페이지 생성**

```tsx
// app/match/schedule/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadMatchFlow, saveMatchFlow } from "@/lib/storage";
import { getEarliestIntersection } from "@/lib/schedule";

const TIME_SLOTS = ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

function getCalendarDays(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// skeleton: 상대팀이 선택한 날짜 mock
const MOCK_THEIR_DATES = (() => {
  const days = getCalendarDays();
  return [days[3], days[5], days[6], days[8], days[10], days[11]];
})();

const MOCK_THEIR_TIMES = ["18:00", "19:00", "20:00"];

export default function SchedulePage() {
  const router = useRouter();
  const [step, setStep] = useState<"date" | "time">("date");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const calendarDays = getCalendarDays();

  function toggleDate(d: string) {
    setSelectedDates((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function toggleTime(t: string) {
    setSelectedTimes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function handleDateNext() {
    if (selectedDates.length === 0) return;
    setStep("time");
  }

  function handleConfirm() {
    if (selectedTimes.length === 0) return;
    const confirmedDate = getEarliestIntersection(
      selectedDates.sort(),
      MOCK_THEIR_DATES
    );
    const confirmedTime = getEarliestIntersection(
      selectedTimes.sort(),
      MOCK_THEIR_TIMES
    );
    const flow = loadMatchFlow();
    if (!flow) return;
    saveMatchFlow({
      ...flow,
      schedule: {
        ...flow.schedule,
        availableDates: selectedDates,
        availableTimes: selectedTimes,
        confirmedDate: confirmedDate ?? selectedDates.sort()[0],
        confirmedTime: confirmedTime ?? selectedTimes.sort()[0],
      },
    });
    router.push("/match/confirmed");
  }

  function formatDateLabel(iso: string) {
    const d = new Date(iso);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
  }

  if (step === "time") {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto">
            <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">가능한 시간을 골라주세요</h1>
            <p className="text-xs text-muted mb-8">두 팀이 겹치는 가장 빠른 시간으로 자동 확정돼요</p>
            <div className="grid grid-cols-3 gap-3 mb-8">
              {TIME_SLOTS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTime(t)}
                  className={`py-3 rounded-[12px] text-sm font-bold border-[1.5px] transition-all ${
                    selectedTimes.includes(t)
                      ? "bg-gradient-to-br from-primary to-[#ff7e5f] text-white border-primary shadow-btn-primary"
                      : "border-hairline text-muted hover:border-primary hover:text-primary"
                  }`}
                >
                  오후 {parseInt(t) - 12 > 0 ? parseInt(t) - 12 : parseInt(t)}시
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted text-center mb-6">
              {selectedTimes.length}개 선택됨
            </p>
            <Button fullWidth disabled={selectedTimes.length === 0} onClick={handleConfirm}>
              확정하기 →
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">가능한 날짜를 골라주세요</h1>
          <p className="text-xs text-muted mb-6">
            한 달 내 가능한 날 모두 선택해주세요.<br />
            <span className="text-primary font-bold">●</span> 상대팀도 가능한 날이에요
          </p>
          <div className="grid grid-cols-4 gap-2 mb-8">
            {calendarDays.map((d) => {
              const isMine = selectedDates.includes(d);
              const isBoth = isMine && MOCK_THEIR_DATES.includes(d);
              const isTheirOnly = !isMine && MOCK_THEIR_DATES.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDate(d)}
                  className={`py-2.5 rounded-[10px] text-xs font-bold border-[1.5px] transition-all relative ${
                    isBoth
                      ? "bg-gradient-to-br from-primary to-[#ff7e5f] text-white border-primary shadow-btn-primary"
                      : isMine
                      ? "bg-primary-soft text-primary border-primary-disabled"
                      : isTheirOnly
                      ? "border-primary-disabled text-primary bg-white"
                      : "border-hairline text-muted"
                  }`}
                >
                  {formatDateLabel(d)}
                  {isTheirOnly && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted text-center mb-6">
            {selectedDates.length}개 선택됨 · 겹치는 날 {selectedDates.filter((d) => MOCK_THEIR_DATES.includes(d)).length}개
          </p>
          <Button fullWidth disabled={selectedDates.length === 0} onClick={handleDateNext}>
            다음 — 시간 선택 →
          </Button>
        </div>
      </main>
    </>
  );
}
```

- [x] **Step 2: 브라우저 확인**

`http://localhost:3000/match/schedule` → 달력 표시 → 날짜 선택 → 핑크 fill → "다음" → 시간 선택 → "확정하기" → `/match/confirmed` 이동 확인

- [x] **Step 3: 커밋**

```bash
git add app/match/schedule/page.tsx
git commit -m "feat: add date and time scheduling page"
```

---

## Task 8: 일정 확정 + 카운트다운 페이지

**Files:**
- Create: `app/match/confirmed/page.tsx`

- [x] **Step 1: 페이지 생성**

```tsx
// app/match/confirmed/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadMatchFlow } from "@/lib/storage";
import { MatchFlowState } from "@/types/match-flow";
import { distributeQuestions } from "@/lib/qa";
import { QUESTIONS_BY_MOOD } from "@/data/questions-by-mood";
import { loadTeam } from "@/lib/storage";

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function ConfirmedPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<MatchFlowState | null>(null);

  useEffect(() => {
    setFlow(loadMatchFlow());
  }, []);

  if (!flow?.schedule.confirmedDate) {
    return (
      <>
        <AppHeader />
        <main className="py-20 px-4 text-center">
          <p className="text-muted mb-4">일정 정보가 없어요.</p>
          <Button onClick={() => router.push("/match/schedule")}>날짜 다시 정하기</Button>
        </main>
      </>
    );
  }

  const team = loadTeam();
  const mood = flow.matchedTeam.mood;
  const questions = team ? QUESTIONS_BY_MOOD[mood] ?? [] : [];
  const daysLeft = getDaysUntil(flow.schedule.confirmedDate);
  const distribution = distributeQuestions(questions.length, Math.max(1, daysLeft));

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto flex flex-col gap-5">
          {/* 확정 카드 */}
          <div className="bg-gradient-to-br from-primary-soft to-[#ffe4ed] border-[1.5px] border-primary-disabled rounded-[16px] p-5 text-center">
            <div className="text-3xl mb-3">📅</div>
            <h2 className="text-base font-black text-ink mb-4">만남 일정이 확정됐어요!</h2>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">📅</span>
                <span className="text-sm font-black text-ink">{formatDate(flow.schedule.confirmedDate)}</span>
              </div>
              {flow.schedule.confirmedTime && (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-base">🕖</span>
                  <span className="text-sm font-black text-ink">
                    오후 {parseInt(flow.schedule.confirmedTime) - 12}시
                  </span>
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">📍</span>
                <span className="text-sm text-muted">장소는 D-1에 공개돼요</span>
              </div>
            </div>
          </div>

          {/* 카운트다운 */}
          <div className="bg-[#111] rounded-[16px] p-5 text-center">
            <div className="text-[10px] font-bold text-[#888] uppercase tracking-widest mb-2">만남까지</div>
            <div className="text-[48px] font-black text-white leading-none tracking-[-2px] mb-1">
              <span className="text-primary">{daysLeft}</span>일
            </div>
            <div className="text-[11px] text-[#666]">매일 Q&A로 상대팀을 알아가요</div>
          </div>

          {/* Q&A 예고 */}
          <div className="bg-surface-soft rounded-[14px] p-4">
            <p className="text-xs font-black text-ink mb-3">📦 Q&A 공개 일정</p>
            <div className="flex flex-col gap-1.5">
              {distribution.map((count, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-bold text-ink w-12">D-{daysLeft - i}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: count }).map((_, j) => (
                      <span key={j} className="w-4 h-4 rounded-full bg-primary-soft border border-primary-disabled flex items-center justify-center text-[8px] font-bold text-primary">Q</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button fullWidth onClick={() => router.push("/match/qa")}>
            Q&A 시작하기 →
          </Button>
        </div>
      </main>
    </>
  );
}
```

- [x] **Step 2: 브라우저 확인**

`http://localhost:3000/match/confirmed` → 날짜·시간 표시, D-N 카운트다운, Q&A 분배 일정 확인

- [x] **Step 3: 커밋**

```bash
git add app/match/confirmed/page.tsx
git commit -m "feat: add match confirmed page with countdown and Q&A schedule"
```

---

## Task 9: Q&A 일일 공개 페이지

**Files:**
- Create: `app/match/qa/page.tsx`

- [x] **Step 1: 페이지 생성**

```tsx
// app/match/qa/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { loadMatchFlow, saveMatchFlow, loadTeam } from "@/lib/storage";
import { QUESTIONS_BY_MOOD, QAQuestion } from "@/data/questions-by-mood";
import { distributeQuestions, getTodayMemberIndex, getChemistryComment } from "@/lib/qa";
import { MatchFlowState, QAAnswer } from "@/types/match-flow";
import { TeamProfile } from "@/types/matching";

type ViewState = "question" | "waiting" | "revealed" | "history";

export default function QAPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<MatchFlowState | null>(null);
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [view, setView] = useState<ViewState>("question");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [todayQuestion, setTodayQuestion] = useState<QAQuestion | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [todayMemberName, setTodayMemberName] = useState("");

  useEffect(() => {
    const f = loadMatchFlow();
    const t = loadTeam();
    if (!f || !t) return;
    setFlow(f);
    setTeam(t);

    const questions = QUESTIONS_BY_MOOD[f.matchedTeam.mood] ?? [];
    const daysLeft = 5; // skeleton: 실제는 confirmedDate 기반 계산
    const distribution = distributeQuestions(questions.length, daysLeft);
    const questionsForToday = distribution[f.currentQADay - 1] ?? 0;
    const answeredToday = f.qaAnswers.filter(
      (a) => a.questionId.includes(`day${f.currentQADay}`)
    ).length;

    if (questionsForToday > 0 && answeredToday < questionsForToday) {
      setTodayQuestion(questions[f.qaAnswers.length] ?? questions[0]);
    }

    const memberIdx = getTodayMemberIndex(f.currentQADay, t.members.length);
    const todayMember = t.members[memberIdx];
    setTodayMemberName(todayMember?.nickname ?? "");
    setIsMyTurn(todayMember?.isLeader === true);

    if (f.qaAnswers.length > 0) setView("history");
  }, []);

  function handleSubmit() {
    if (!selectedAnswer || !flow || !team || !todayQuestion) return;

    // skeleton: 상대방 답변은 mock
    const mockTheirAnswers = todayQuestion.choices;
    const mockTheirAnswer = mockTheirAnswers[Math.floor(Math.random() * mockTheirAnswers.length)];

    const newAnswer: QAAnswer = {
      questionId: `day${flow.currentQADay}-${todayQuestion.id}`,
      myAnswer: selectedAnswer,
      theirAnswer: mockTheirAnswer,
      memberId: team.members.find((m) => m.isLeader)?.nickname ?? "",
      theirMemberId: "상대팀원",
    };

    const updated: MatchFlowState = {
      ...flow,
      qaAnswers: [...flow.qaAnswers, newAnswer],
    };
    saveMatchFlow(updated);
    setFlow(updated);
    setView("revealed");
  }

  const latestAnswer = flow?.qaAnswers[flow.qaAnswers.length - 1];

  if (view === "revealed" && latestAnswer) {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto flex flex-col gap-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 bg-primary-soft border border-primary-disabled rounded-full px-3 py-1.5 text-[10px] font-bold text-primary mb-3">
                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                상대팀 답변이 공개됐어요!
              </div>
              <p className="text-sm font-black text-ink mb-1 leading-snug">
                {todayQuestion?.text}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="bg-gradient-to-br from-primary-soft to-[#ffe4ed] border-[1.5px] border-primary-disabled rounded-[14px] p-4">
                <div className="text-[9px] font-bold text-[#ff9ab0] uppercase tracking-wide mb-2">우리 팀원 답변</div>
                <div className="text-sm font-black text-ink">{latestAnswer.myAnswer}</div>
              </div>
              <div className="bg-gradient-to-br from-[#f0f5ff] to-[#e8e8ff] border-[1.5px] border-[#cce0ff] rounded-[14px] p-4">
                <div className="text-[9px] font-bold text-[#90b4e8] uppercase tracking-wide mb-2">상대팀원 답변</div>
                <div className="text-sm font-black text-ink">{latestAnswer.theirAnswer}</div>
              </div>
            </div>

            <div className="bg-surface-soft rounded-[12px] p-3 text-center text-xs text-muted leading-relaxed">
              {getChemistryComment(latestAnswer.myAnswer, latestAnswer.theirAnswer ?? "")}
            </div>

            <Button fullWidth onClick={() => setView("history")}>
              전체 기록 보기
            </Button>
          </div>
        </main>
      </>
    );
  }

  if (view === "history") {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto">
            <h1 className="text-xl font-black text-ink tracking-[-0.5px] mb-1">Q&A 기록</h1>
            <p className="text-xs text-muted mb-6">지금까지 나눈 대화예요</p>
            <div className="flex flex-col gap-3 mb-6">
              {flow?.qaAnswers.map((a, i) => (
                <div key={i} className="bg-surface-soft rounded-[14px] p-4">
                  <p className="text-[10px] font-bold text-muted mb-3 uppercase tracking-wide">Q{i + 1}</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-start">
                      <span className="text-[10px] font-bold text-primary w-12 shrink-0">우리팀</span>
                      <span className="text-xs text-ink">{a.myAnswer}</span>
                    </div>
                    {a.theirAnswer && (
                      <div className="flex gap-2 items-start">
                        <span className="text-[10px] font-bold text-[#4f9eff] w-12 shrink-0">상대팀</span>
                        <span className="text-xs text-ink">{a.theirAnswer}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted mt-2 italic">
                    {a.theirAnswer ? getChemistryComment(a.myAnswer, a.theirAnswer) : ""}
                  </p>
                </div>
              ))}
            </div>
            {todayQuestion && isMyTurn && (
              <Button fullWidth onClick={() => setView("question")}>
                오늘 질문 답하기 →
              </Button>
            )}
          </div>
        </main>
      </>
    );
  }

  // 내 차례 아닐 때
  if (!isMyTurn) {
    return (
      <>
        <AppHeader />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto text-center">
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-lg font-black text-ink mb-2">오늘은 {todayMemberName}님 차례예요</h2>
            <p className="text-sm text-muted mb-8">답변이 완료되면 대화를 볼 수 있어요</p>
            <Button variant="secondary" fullWidth onClick={() => setView("history")}>
              이전 기록 보기
            </Button>
          </div>
        </main>
      </>
    );
  }

  // 내 차례 + 질문
  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto flex flex-col gap-5">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold text-primary">오늘의 질문</span>
              <span className="text-[10px] text-muted font-bold">
                {(flow?.qaAnswers.length ?? 0) + 1} / {QUESTIONS_BY_MOOD[flow?.matchedTeam.mood ?? "comfortableTalk"]?.length ?? 5}
              </span>
            </div>
            <div className="h-1 bg-surface-soft rounded-full">
              <div
                className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full"
                style={{
                  width: `${((flow?.qaAnswers.length ?? 0) / (QUESTIONS_BY_MOOD[flow?.matchedTeam.mood ?? "comfortableTalk"]?.length ?? 5)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-[16px] overflow-hidden shadow-card">
            <div className="bg-gradient-to-br from-[#1a1230] to-[#2d1f45] p-5 text-center">
              <div className="inline-block bg-[rgba(255,90,111,0.2)] text-[#ff9ab0] text-[9px] font-bold rounded-full px-3 py-1 mb-3 border border-[rgba(255,90,111,0.25)]">
                📬 오늘 질문 도착
              </div>
              <p className="text-sm font-black text-white leading-snug">{todayQuestion?.text}</p>
            </div>
            <div className="bg-white p-4">
              <div className="flex flex-col gap-2 mb-4">
                {todayQuestion?.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setSelectedAnswer(choice)}
                    className={`text-left px-4 py-3 rounded-[10px] border-[1.5px] text-sm font-medium transition-all ${
                      selectedAnswer === choice
                        ? "border-primary bg-primary-soft text-primary font-bold"
                        : "border-hairline text-body hover:border-primary"
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <Button fullWidth disabled={!selectedAnswer} onClick={handleSubmit}>
                답변 제출하고 상대 보기 →
              </Button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
```

- [x] **Step 2: 브라우저 확인**

`http://localhost:3000/match/qa` → 질문 카드 → 선택지 탭 → 제출 → 두 답변 비교 + 케미 코멘트 → 기록 보기 확인

- [x] **Step 3: 커밋**

```bash
git add app/match/qa/page.tsx
git commit -m "feat: add Q&A daily reveal page with rotation and chemistry comments"
```

---

## Task 10: 당일 팀장 채팅 Skeleton

**Files:**
- Create: `app/match/chat/page.tsx`

- [x] **Step 1: 채팅 UI skeleton 생성**

```tsx
// app/match/chat/page.tsx
"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";

type Message = { text: string; isMe: boolean; time: string };

const INITIAL_MESSAGES: Message[] = [
  { text: "안녕하세요! 오늘 7시에 봬요 😊", isMe: false, time: "오후 2:14" },
  { text: "네! 저희도 기대하고 있어요 ㅎㅎ", isMe: true, time: "오후 2:16" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim()) return;
    const now = new Date();
    const time = `오후 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setMessages((prev) => [...prev, { text: input.trim(), isMe: true, time }]);
    setInput("");
  }

  return (
    <>
      <AppHeader />
      <div className="flex flex-col h-[calc(100vh-44px)] bg-white max-w-[560px] mx-auto">
        {/* 채팅 헤더 */}
        <div className="px-4 py-3 bg-surface-soft border-b border-hairline-soft flex items-center gap-3">
          <div className="flex">
            <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-xs">👑</div>
            <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-[#7c5cbf] to-[#a07ee8] flex items-center justify-center text-xs -ml-1.5 border-2 border-white">👑</div>
          </div>
          <div className="flex-1">
            <div className="text-xs font-black text-ink">팀장 채널</div>
            <div className="text-[10px] text-muted">오늘만 열리는 채팅이에요</div>
          </div>
          <span className="text-[9px] bg-amber text-amber-ink border border-[#ffe0a0] rounded-full px-2 py-0.5 font-bold">
            skeleton
          </span>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] ${m.isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                <div
                  className={`px-3 py-2 rounded-[12px] text-sm leading-snug ${
                    m.isMe
                      ? "bg-gradient-to-r from-primary to-[#ff7e5f] text-white rounded-br-[4px]"
                      : "bg-surface-soft text-ink rounded-bl-[4px]"
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-muted">{m.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 입력창 */}
        <div className="px-4 py-3 border-t border-hairline-soft flex gap-2 items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="메시지 입력…"
            className="flex-1 bg-surface-soft rounded-full px-4 py-2 text-sm text-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-[#ff7e5f] flex items-center justify-center text-white text-sm font-bold shadow-btn-primary"
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
```

- [x] **Step 2: 브라우저 확인**

`http://localhost:3000/match/chat` → 초기 메시지 2개 → 입력 후 Enter or ↑ 버튼 → 메시지 추가 확인

- [x] **Step 3: 전체 테스트 확인**

```bash
npm test 2>&1 | tail -15
```

Expected: 모든 테스트 pass

- [x] **Step 4: 빌드 최종 확인**

```bash
npm run build 2>&1 | tail -5
```

Expected: 에러 없이 빌드 성공

- [x] **Step 5: 최종 커밋**

```bash
git add app/match/chat/page.tsx
git commit -m "feat: add day-of team leader chat skeleton"
```

---

## 셀프 리뷰 체크리스트

- [x] **Spec 커버리지**: 스펙 §3-5 ~ §3-9 전부 커버. Q&A 순번제, 케미 코멘트, 날짜·시간 intersection, skeleton 표시 포함
- [x] **Placeholder 없음**: 모든 step에 실제 코드 포함. skeleton 항목은 주석으로 명시
- [x] **타입 일관성**: `MatchFlowState`, `QAAnswer`, `QAQuestion` 타입이 Task 1에서 정의되고 이후 Task에서 동일하게 사용
- [x] **누락 없음**: `distributeQuestions` (Task 3), `getEarliestIntersection` (Task 4), `getTodayMemberIndex` (Task 3), `getChemistryComment` (Task 3) 모두 구현 후 페이지에서 import
- [x] **skeleton 명시**: 초대 코드 전달, 상대방 실시간 날짜 공유, 푸시 알림, Supabase Realtime 채팅 모두 skeleton 처리 및 주석 표시
