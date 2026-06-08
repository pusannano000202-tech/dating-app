# 부팅 — Plan 2: 성별 기능 + 팀 만들기 리뉴얼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** UserProfile/TeamMember에 gender 필드 추가, 혼성 팀 매칭 로직(합산 남:여=1:1) 구현, 테스트 플로우에 성별 선택 화면 추가, 팀 만들기 페이지를 초대 코드 skeleton 방식으로 전면 교체한다.

**Architecture:** 타입 변경(breaking) → storage 업데이트 → 매칭 로직 → UI 순서로 진행. gender 필드는 하위 호환을 위해 optional로 추가 후 UI에서 항상 세팅. Plan 1 완료 후 실행할 것.

**Tech Stack:** Next.js 14 (App Router), TypeScript, localStorage, Tailwind CSS v3

---

## 파일 맵

| 파일 | 작업 |
|------|------|
| `types/matching.ts` | `UserProfile`, `TeamMember`, `TeamProfile`에 gender 추가 |
| `lib/storage.ts` | save/load 함수 gender 필드 반영 |
| `lib/matching.ts` | `isGenderCompatible()` 추가, `rankTeams` 필터 적용 |
| `app/test/page.tsx` | 성별 선택 화면 추가 (퀴즈 시작 전) |
| `app/team/create/page.tsx` | 초대 코드 skeleton UI로 전면 교체 |
| `app/team/demo/page.tsx` | 성별 구성 표시 (남 N · 여 N) 추가 |
| `components/TeamProfileCard.tsx` | 성별 구성 뱃지 추가 |
| `__tests__/matching.test.ts` | isGenderCompatible 테스트 추가 |
| `__tests__/scoring.test.ts` | 기존 테스트 gender 옵셔널 처리 확인 |

---

## Task 1: 타입 정의에 gender 추가

**Files:**
- Modify: `types/matching.ts`

- [x] **Step 1: 기존 타입 파일 확인**

```bash
cat types/matching.ts
```

- [x] **Step 2: gender 필드 추가**

`UserProfile`, `TeamMember`, `TeamProfile`에 gender 추가. 기존 코드 하위 호환을 위해 optional(`?`)로 선언:

```ts
// types/matching.ts — 전체 파일
export type TraitKey =
  | "atmosphereCoordination"
  | "consideration"
  | "participation"
  | "respectfulness"
  | "communicationBalance";

export type MemberRole = "moodMaker" | "coordinator" | "considerate" | "reactor";

export type MoodKey =
  | "comfortableTalk"
  | "activeSocial"
  | "gamesAndDrinks"
  | "respectfulSafe"
  | "naturalIntro";

export type Gender = "male" | "female";

export type UserProfile = {
  nickname: string;
  traits: Record<TraitKey, number>;
  gender?: Gender;
};

export type TeamMember = {
  nickname: string;
  role: MemberRole;
  traits?: Record<TraitKey, number>;
  isLeader?: boolean;
  gender?: Gender;
};

export type TeamProfile = {
  teamName: string;
  school: string;
  region: string;
  size: number;
  ageRange: string;
  mood: MoodKey;
  members: TeamMember[];
  maleCount?: number;
  femaleCount?: number;
};

export type MatchResult = {
  team: TeamProfile;
  score: number;
  label: "Strong vibe fit" | "Good with some differences" | "Different atmosphere preferences";
  reasons: string[];
};
```

- [x] **Step 3: 빌드 에러 없는지 확인**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음 (optional 필드이므로 기존 코드 영향 없음)

- [x] **Step 4: 커밋**

```bash
git add types/matching.ts
git commit -m "feat: add Gender type and optional gender fields to UserProfile/TeamMember/TeamProfile"
```

---

## Task 2: Storage 함수 업데이트

**Files:**
- Modify: `lib/storage.ts`

- [x] **Step 1: 기존 storage.ts 확인**

```bash
cat lib/storage.ts
```

- [x] **Step 2: gender 필드가 자연스럽게 저장/로드되도록 확인**

`UserProfile`과 `TeamProfile`은 JSON 직렬화되므로 `gender` 필드는 자동으로 포함됨. storage.ts 자체는 타입만 import하므로 타입 변경만으로 충분.

타입 import 확인 후 변경 없으면:

```bash
grep -n "UserProfile\|TeamProfile\|gender" lib/storage.ts
```

Expected: `UserProfile`, `TeamProfile` import가 있고 gender 관련 코드 없음 → 추가 수정 불필요.

만약 storage.ts에서 필드를 명시적으로 구조분해하는 코드가 있다면 gender 포함 추가:

```ts
// 예시: 명시적 구조분해가 있는 경우
export function saveUser(profile: UserProfile) {
  localStorage.setItem("user", JSON.stringify(profile)); // 이미 전체 객체 저장이면 OK
}
```

- [x] **Step 3: 커밋 (변경 있을 경우만)**

```bash
git add lib/storage.ts
git commit -m "feat: storage functions pass through gender field"
```

---

## Task 3: 매칭 로직 — 성별 호환성 추가

**Files:**
- Modify: `lib/matching.ts`
- Modify: `__tests__/matching.test.ts`

- [x] **Step 1: 기존 matching.ts 확인**

```bash
cat lib/matching.ts
```

- [x] **Step 2: 테스트 먼저 작성**

```ts
// __tests__/matching.test.ts 에 추가 (기존 테스트 아래에 append)
import { isGenderCompatible } from "../lib/matching";
import { TeamProfile } from "../types/matching";

const makeTeam = (male: number, female: number): TeamProfile => ({
  teamName: "test",
  school: "부산대학교",
  region: "부산",
  size: male + female,
  ageRange: "22~24",
  mood: "comfortableTalk",
  members: [
    ...Array(male).fill({ nickname: "m", role: "moodMaker" as const, gender: "male" as const }),
    ...Array(female).fill({ nickname: "f", role: "reactor" as const, gender: "female" as const }),
  ],
  maleCount: male,
  femaleCount: female,
});

describe("isGenderCompatible", () => {
  test("3남0여 + 0남3여 → 합산 3:3 → compatible", () => {
    expect(isGenderCompatible(makeTeam(3, 0), makeTeam(0, 3))).toBe(true);
  });

  test("2남1여 + 1남2여 → 합산 3:3 → compatible", () => {
    expect(isGenderCompatible(makeTeam(2, 1), makeTeam(1, 2))).toBe(true);
  });

  test("2남1여 + 2남1여 → 합산 4:2 → incompatible", () => {
    expect(isGenderCompatible(makeTeam(2, 1), makeTeam(2, 1))).toBe(false);
  });

  test("gender 없는 팀 → 항상 compatible (하위 호환)", () => {
    const noGenderTeam: TeamProfile = makeTeam(0, 0);
    noGenderTeam.maleCount = undefined;
    noGenderTeam.femaleCount = undefined;
    expect(isGenderCompatible(noGenderTeam, makeTeam(1, 2))).toBe(true);
  });
});
```

- [x] **Step 3: 테스트 실패 확인**

```bash
npm test -- --testPathPattern="matching" 2>&1 | tail -15
```

Expected: FAIL — `isGenderCompatible is not a function`

- [x] **Step 4: isGenderCompatible 구현**

`lib/matching.ts`의 기존 코드 아래에 추가:

```ts
// lib/matching.ts 에 추가
import { TeamProfile, MatchResult } from "@/types/matching";

export function isGenderCompatible(teamA: TeamProfile, teamB: TeamProfile): boolean {
  // gender 정보 없으면 하위 호환으로 통과
  if (teamA.maleCount === undefined || teamB.maleCount === undefined) return true;
  const totalMale = teamA.maleCount + teamB.maleCount;
  const totalFemale = (teamA.femaleCount ?? 0) + (teamB.femaleCount ?? 0);
  return totalMale === totalFemale;
}
```

그리고 기존 `rankTeams` 함수에서 gender 필터 적용:

```ts
// 기존 rankTeams 함수에서 filter 추가
export function rankTeams(myTeam: TeamProfile, candidates: TeamProfile[]): MatchResult[] {
  return candidates
    .filter((team) => isGenderCompatible(myTeam, team))  // ← 이 줄 추가
    .map((team) => scoreTeam(myTeam, team))
    .sort((a, b) => b.score - a.score);
}
```

(기존 rankTeams 구현이 다르면 `.filter(team => isGenderCompatible(myTeam, team))` 를 map 앞에 체이닝)

- [x] **Step 5: 테스트 통과 확인**

```bash
npm test -- --testPathPattern="matching" 2>&1 | tail -15
```

Expected: PASS (새 테스트 4개 + 기존 테스트 모두)

- [x] **Step 6: 커밋**

```bash
git add lib/matching.ts __tests__/matching.test.ts
git commit -m "feat: add isGenderCompatible and filter rankTeams by gender balance"
```

---

## Task 4: 성향 테스트 — 성별 선택 화면 추가

**Files:**
- Modify: `app/test/page.tsx`

- [x] **Step 1: gender state 및 성별 선택 화면 추가**

`app/test/page.tsx` 전체를 교체. 기존 로직은 유지하고 성별 선택 단계만 앞에 추가:

```tsx
// app/test/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { QuizCard } from "@/components/QuizCard";
import { Button } from "@/components/Button";
import { questions } from "@/data/questions";
import { saveUser } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { TraitKey, MemberRole, UserProfile, Gender } from "@/types/matching";

const ROLE_LABELS: Record<MemberRole, { name: string; desc: string; emoji: string }> = {
  moodMaker:   { name: "분위기 메이커형", desc: "에너지를 끌어올리고 자리를 살려주는 역할이에요.",  emoji: "🔥" },
  coordinator: { name: "조율자형",        desc: "대화 흐름을 이어주고 균형을 맞추는 역할이에요.",    emoji: "🎯" },
  considerate: { name: "배려형",          desc: "모두를 세심하게 챙기는 역할이에요.",               emoji: "🤍" },
  reactor:     { name: "리액션형",        desc: "분위기를 살려주는 반응으로 자리를 따뜻하게 해요.", emoji: "✨" },
};

const TRAIT_LABELS: Record<string, string> = {
  atmosphereCoordination: "분위기 조율",
  consideration:          "배려심",
  participation:          "적극성",
  communicationBalance:   "소통 균형",
};

type TraitScores = Partial<Record<TraitKey, number[]>>;
type Step = "gender" | "quiz" | "result";

export default function TestPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("gender");
  const [gender, setGender] = useState<Gender | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [traitScores, setTraitScores] = useState<TraitScores>({});
  const [nickname, setNickname] = useState("");
  const [resultRole, setResultRole] = useState<MemberRole | null>(null);
  const [finalTraits, setFinalTraits] = useState<Record<TraitKey, number> | null>(null);

  const current = questions[currentIdx];

  function handleGenderNext() {
    if (!gender) return;
    setStep("quiz");
  }

  function handleSelect(score: number) {
    const trait = current.trait;
    const updated: TraitScores = {
      ...traitScores,
      [trait]: [...(traitScores[trait] ?? []), score],
    };
    setTraitScores(updated);

    if (currentIdx + 1 >= questions.length) {
      const allTraits: TraitKey[] = [
        "atmosphereCoordination", "consideration", "participation",
        "respectfulness", "communicationBalance",
      ];
      const traits = allTraits.reduce((acc, key) => {
        const scores = updated[key] ?? [3];
        acc[key] = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
        return acc;
      }, {} as Record<TraitKey, number>);
      setFinalTraits(traits);
      setResultRole(classifyRole(traits));
      setStep("result");
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function handleSave() {
    if (!nickname.trim() || !finalTraits || !gender) return;
    const profile: UserProfile = { nickname: nickname.trim(), traits: finalTraits, gender };
    saveUser(profile);
    router.push("/team/create");
  }

  // ── 성별 선택 ──
  if (step === "gender") {
    return (
      <>
        <AppHeader step={1} totalSteps={3} />
        <main className="py-12 px-4 bg-white min-h-screen">
          <div className="max-w-[400px] mx-auto text-center">
            <div className="text-4xl mb-4">👋</div>
            <h2 className="text-xl font-black text-ink tracking-[-0.5px] mb-2">먼저 성별을 알려주세요</h2>
            <p className="text-sm text-muted mb-8 leading-relaxed">
              팀 매칭에 사용돼요.<br />
              <span className="text-[11px] text-muted/60">매칭 외 목적으로 사용되지 않아요</span>
            </p>
            <div className="flex gap-4 mb-8">
              <button
                type="button"
                onClick={() => setGender("male")}
                className={`flex-1 border-[2px] rounded-[16px] py-5 flex flex-col items-center gap-2 transition-all ${
                  gender === "male"
                    ? "border-[#4f9eff] bg-[#f0f5ff]"
                    : "border-hairline bg-white hover:border-hairline-soft"
                }`}
              >
                <span className="text-3xl">🙋‍♂️</span>
                <span className="text-sm font-bold text-ink">남자</span>
              </button>
              <button
                type="button"
                onClick={() => setGender("female")}
                className={`flex-1 border-[2px] rounded-[16px] py-5 flex flex-col items-center gap-2 transition-all ${
                  gender === "female"
                    ? "border-primary bg-primary-soft"
                    : "border-hairline bg-white hover:border-hairline-soft"
                }`}
              >
                <span className="text-3xl">🙋‍♀️</span>
                <span className="text-sm font-bold text-ink">여자</span>
              </button>
            </div>
            <Button fullWidth disabled={!gender} onClick={handleGenderNext}>
              다음 — 성향 테스트 시작 →
            </Button>
          </div>
        </main>
      </>
    );
  }

  // ── 결과 ──
  if (step === "result" && resultRole) {
    const info = ROLE_LABELS[resultRole];
    return (
      <>
        <AppHeader step={1} totalSteps={3} />
        <main className="py-10 px-4 bg-white min-h-screen">
          <div className="max-w-[480px] mx-auto">
            <div className="text-center mb-8">
              <div className="text-[52px] mb-3">{info.emoji}</div>
              <h2 className="text-2xl font-black text-ink tracking-[-0.5px] mb-2">{info.name}</h2>
              <p className="text-sm text-muted leading-relaxed">{info.desc}</p>
            </div>
            {finalTraits && (
              <div className="bg-surface-soft rounded-card p-4 mb-6 flex flex-col gap-3">
                {Object.entries(finalTraits).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-muted w-16 shrink-0 text-right">
                      {TRAIT_LABELS[key] ?? key}
                    </span>
                    <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full transition-all duration-500"
                        style={{ width: `${(value / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-black text-primary w-6 text-right">
                      {value * 20}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                닉네임을 입력해주세요
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예: 민준"
                maxLength={10}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>
            <Button fullWidth onClick={handleSave} disabled={!nickname.trim()}>
              팀 만들러 가기 →
            </Button>
          </div>
        </main>
      </>
    );
  }

  // ── 퀴즈 ──
  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px]">나의 과팅 스타일은?</h1>
          <p className="text-sm text-muted mt-1">상황을 읽고 솔직하게 골라주세요</p>
        </div>
        <QuizCard
          question={current}
          current={currentIdx + 1}
          total={questions.length}
          onSelect={handleSelect}
        />
      </main>
    </>
  );
}
```

- [x] **Step 2: 브라우저에서 플로우 확인**

`http://localhost:3000/test` → 성별 선택 화면 → 여자 탭 → 핑크 테두리 → "다음" 버튼 → 퀴즈 시작 → 완료 → 결과 화면

- [x] **Step 3: localStorage에 gender 저장 확인**

결과 화면에서 닉네임 입력 후 "팀 만들러 가기" → 브라우저 DevTools → Application → localStorage → `user` 키 → `{"nickname":"...","traits":{...},"gender":"female"}` 형태 확인

- [x] **Step 4: 커밋**

```bash
git add app/test/page.tsx
git commit -m "feat: add gender selection screen to test flow"
```

---

## Task 5: 팀 만들기 — 초대 코드 skeleton으로 전면 교체

**Files:**
- Modify: `app/team/create/page.tsx`

기존 `extraMembers` / `MemberRoleCard` 방식 → 초대 코드 skeleton + 팀원 대기 상태 UI로 교체.

- [x] **Step 1: 전체 교체**

```tsx
// app/team/create/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { MoodSelector } from "@/components/MoodSelector";
import { loadUser, saveTeam } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { MoodKey, TeamProfile, TeamMember, Gender } from "@/types/matching";

const ROLE_LABELS: Record<string, string> = {
  moodMaker: "🔥 분위기 메이커형",
  coordinator: "🎯 조율자형",
  considerate: "🤍 배려형",
  reactor: "✨ 리액션형",
};

const GENDER_LABELS: Record<Gender, string> = {
  male: "남자",
  female: "여자",
};

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return (
    "BT-" +
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
}

export default function TeamCreatePage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [mood, setMood] = useState<MoodKey | null>(null);
  const [leader, setLeader] = useState<TeamMember | null>(null);
  const inviteCode = useMemo(() => generateInviteCode(), []);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const user = loadUser();
    if (!user) return;
    setLeader({
      nickname: user.nickname,
      role: classifyRole(user.traits),
      traits: user.traits,
      isLeader: true,
      gender: user.gender,
    });
  }, []);

  function handleCopyCode() {
    navigator.clipboard.writeText(inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isValid = teamName.trim() !== "" && ageRange.trim() !== "" && mood !== null && leader !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !leader || !mood) return;

    const members: TeamMember[] = [leader];
    const maleCount = members.filter((m) => m.gender === "male").length;
    const femaleCount = members.filter((m) => m.gender === "female").length;

    const team: TeamProfile = {
      teamName: teamName.trim(),
      school: "부산대학교",
      region: "부산",
      size: members.length,
      ageRange: ageRange.trim(),
      mood,
      members,
      maleCount,
      femaleCount,
    };
    saveTeam(team);
    router.push("/team/demo");
  }

  if (!leader) {
    return (
      <>
        <AppHeader />
        <main className="py-20 px-4 text-center max-w-[480px] mx-auto">
          <p className="text-body mb-6">성향 테스트를 먼저 완료해야 팀을 만들 수 있어요.</p>
          <Button onClick={() => router.push("/test")}>성향 테스트 하러 가기</Button>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader step={2} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[560px] mx-auto">
          <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">팀 만들기</h1>
          <p className="text-xs text-muted mb-8">팀 정보를 채우고 친구를 초대해요</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* 팀 이름 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                팀 이름 <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="예: 컴공 왕자들, 경영 여신들"
                maxLength={20}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>

            {/* 나이대 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                나이대 <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                placeholder="예: 22~24"
                maxLength={10}
                className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
              />
            </div>

            {/* 분위기 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                원하는 과팅 분위기 <span className="text-primary">*</span>
              </label>
              <MoodSelector value={mood} onChange={setMood} />
            </div>

            {/* 팀장 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">팀장 (나)</label>
              <div className="bg-gradient-to-br from-primary-soft to-[#fff0f4] border-[1.5px] border-primary-disabled rounded-[14px] p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-base shadow-[0_2px_8px_rgba(255,90,111,0.25)] shrink-0">
                  {leader.role === "moodMaker" ? "🔥" : leader.role === "coordinator" ? "🎯" : leader.role === "considerate" ? "🤍" : "✨"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-ink">{leader.nickname}</span>
                    <span className="text-[9px] bg-primary text-white rounded-full px-1.5 py-0.5 font-bold">팀장</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {leader.gender && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                          leader.gender === "male"
                            ? "bg-[#f0f5ff] text-[#4f9eff] border-[#cce0ff]"
                            : "bg-primary-soft text-primary border-primary-disabled"
                        }`}
                      >
                        {GENDER_LABELS[leader.gender]}
                      </span>
                    )}
                    <span className="text-xs text-primary font-semibold">
                      {ROLE_LABELS[leader.role]}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 팀원 초대 */}
            <div>
              <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wide">
                팀원 초대
              </label>

              {/* 초대 코드 */}
              <div className="bg-surface-soft border-[1.5px] border-hairline rounded-[12px] p-3 flex items-center gap-3 mb-3">
                <span className="text-lg">🔗</span>
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wide">초대 코드</div>
                  <div className="text-lg font-black text-ink tracking-[3px] font-mono">{inviteCode}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-[11px] font-bold text-primary bg-primary-soft border border-primary-disabled rounded-full px-3 py-1.5"
                >
                  {copied ? "복사됨!" : "복사"}
                </button>
              </div>

              {/* 대기 중 슬롯 */}
              <div className="flex flex-col gap-2 mb-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="border-[1.5px] border-hairline rounded-[12px] p-3 flex items-center gap-3 bg-white opacity-60"
                  >
                    <div className="w-9 h-9 rounded-[10px] bg-surface-soft border-[1.5px] border-dashed border-hairline flex items-center justify-center text-base shrink-0">
                      ⏳
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-muted">대기 중…</div>
                      <div className="text-[10px] text-[#ff9500] font-semibold">초대 수락 대기</div>
                    </div>
                    <span className="text-[10px] bg-surface-soft text-muted rounded-full px-2 py-1">미정</span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted text-center">
                초대 코드를 친구에게 공유하면 팀원이 합류해요
                <br />
                <span className="text-[10px] text-muted/60">(현재 코드 공유 기능은 준비 중이에요)</span>
              </p>
            </div>

            <Button type="submit" fullWidth disabled={!isValid}>
              팀 프로필 만들기
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
```

- [x] **Step 2: 브라우저에서 확인**

`http://localhost:3000/team/create` →
- 팀장 카드에 성별 뱃지 표시
- 초대 코드 `BT-XXXX` 표시
- "복사" 버튼 클릭 → "복사됨!" 2초 후 복귀
- 대기 중 슬롯 2개 표시

- [x] **Step 3: TeamProfileCard 성별 구성 추가**

`components/TeamProfileCard.tsx`의 팀 아이덴티티 블록에 성별 구성 뱃지 추가:

```tsx
// components/TeamProfileCard.tsx — 팀 정보 p 태그 아래에 추가
<div className="flex items-center gap-1.5 mt-1">
  {team.maleCount !== undefined && team.maleCount > 0 && (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#f0f5ff] text-[#4f9eff] border border-[#cce0ff]">
      남 {team.maleCount}
    </span>
  )}
  {team.femaleCount !== undefined && team.femaleCount > 0 && (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-soft text-primary border border-primary-disabled">
      여 {team.femaleCount}
    </span>
  )}
</div>
```

- [x] **Step 4: 전체 테스트 확인**

```bash
npm test 2>&1 | tail -15
```

Expected: 모든 테스트 pass

- [x] **Step 5: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```

- [x] **Step 6: 커밋**

```bash
git add app/team/create/page.tsx components/TeamProfileCard.tsx
git commit -m "feat: replace team create with invite code skeleton, add gender badges"
```
