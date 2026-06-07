# 부팅 — Plan 1: 디자인 폴리시 + 리브랜딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 5개 페이지 전체의 비주얼을 "Soft Warm" 방향으로 폴리시하고 앱 이름을 "부팅"으로 리브랜딩한다. 새 기능·타입 변경 없음.

**Architecture:** 순수 UI 레이어만 변경. Tailwind 토큰 추가 → 공통 컴포넌트 업데이트 → 페이지 레이아웃 순으로 진행. 기존 로직(`lib/`, `data/`, `types/`)은 손대지 않음.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v3, Pretendard Variable

---

## 파일 맵

| 파일 | 작업 |
|------|------|
| `tailwind.config.ts` | `card` border-radius 토큰 추가 |
| `app/layout.tsx` | 앱 타이틀 → "부팅" |
| `components/AppHeader.tsx` | 부팅 로고, backdrop-blur, 스타일 |
| `components/Button.tsx` | 그라디언트 primary, rounded-[14px] |
| `components/MoodChip.tsx` | border 두께 → 1.5px, 폰트 업 |
| `components/QuizCard.tsx` | 그라디언트 프로그레스바, rounded-[12px] 선택지 |
| `components/TeamProfileCard.tsx` | 아바타 그라디언트, 구분선, 팀장 뱃지 |
| `components/MatchScoreCard.tsx` | 레이블 → 한국어 "궁합 점수" |
| `components/MatchReasonList.tsx` | 아이콘 + 텍스트 스타일 |
| `components/RecommendationTeamCard.tsx` | rank 강조, 아바타 그라디언트 |
| `app/page.tsx` | Ultra-minimal 홈 전면 재작성 |
| `app/test/page.tsx` | 결과 화면에 성향 점수 바 추가 |
| `app/team/create/page.tsx` | 분위기 선택 → 라디오 카드형, 인풋 스타일 |
| `app/team/demo/page.tsx` | bg-canvas-warm 유지, 폴리시 |
| `app/match/page.tsx` | 헤더 카피, 카드 bg → white, 레이아웃 소폭 |

---

## Task 1: Tailwind 토큰 추가

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: `card` 토큰 추가 및 기존 토큰 확인**

`tailwind.config.ts`의 `borderRadius` 섹션에 `card` 추가:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:           "#ff5a6f",
        "primary-active":  "#e6475d",
        "primary-soft":    "#fff0f2",
        "primary-disabled":"#ffd6dd",
        canvas:            "#ffffff",
        "canvas-warm":     "#fffaf7",
        "surface-soft":    "#f7f7f7",
        ink:               "#222222",
        body:              "#3f3f3f",
        muted:             "#6a6a6a",
        hairline:          "#dddddd",
        "hairline-soft":   "#ebebeb",
        mint:              "#dff8ec",
        "mint-ink":        "#147a55",
        lavender:          "#f0eaff",
        "lavender-ink":    "#5b3ab8",
        sky:               "#eaf5ff",
        "sky-ink":         "#1f6fb2",
        amber:             "#fff3d8",
        "amber-ink":       "#9a6700",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm:   "8px",
        md:   "14px",
        lg:   "20px",
        card: "16px",
        full: "9999px",
      },
      boxShadow: {
        card:    "rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.10) 0 4px 8px",
        "btn-primary": "0 4px 18px rgba(255,90,111,0.28)",
      },
      fontSize: {
        hero:  ["32px", { lineHeight: "1.18", fontWeight: "700" }],
        score: ["48px", { lineHeight: "1.0",  fontWeight: "800" }],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: 빌드 확인**

```bash
cd dating-app/gwating-app
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully` (또는 경고 없이 완료)

- [ ] **Step 3: 커밋**

```bash
git add tailwind.config.ts
git commit -m "style: add card border-radius token and btn-primary shadow"
```

---

## Task 2: 앱 타이틀 리브랜딩

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: metadata 타이틀 변경**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부팅 — 부산대 과팅",
  description: "당신의 연애세포를 부팅하세요! 부산대생 전용 팀 과팅 서비스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/layout.tsx
git commit -m "brand: rename app title to 부팅"
```

---

## Task 3: AppHeader 리브랜딩

**Files:**
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: 컴포넌트 재작성**

```tsx
// components/AppHeader.tsx
import Link from "next/link";

type Props = {
  step?: number;
  totalSteps?: number;
};

export function AppHeader({ step, totalSteps }: Props) {
  return (
    <header className="h-11 border-b border-hairline-soft bg-white/90 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-[1120px] mx-auto px-4 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-xs shadow-[0_2px_6px_rgba(255,90,111,0.25)]">
            ⚡
          </div>
          <span className="font-black text-ink text-[15px] tracking-[-0.5px]">부팅</span>
        </Link>
        {step !== undefined && totalSteps !== undefined && (
          <span className="text-[10px] font-bold text-muted">
            {step} / {totalSteps} 단계
          </span>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 개발 서버 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` — 헤더에 ⚡ 부팅 로고 확인

- [ ] **Step 3: 커밋**

```bash
git add components/AppHeader.tsx
git commit -m "style: rebrand AppHeader to 부팅 with gradient icon"
```

---

## Task 4: Button 컴포넌트 리디자인

**Files:**
- Modify: `components/Button.tsx`

- [ ] **Step 1: 컴포넌트 재작성**

```tsx
// components/Button.tsx
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  const base =
    "h-12 px-6 rounded-md text-base font-extrabold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary:
      "bg-gradient-to-r from-primary to-[#ff7e5f] text-white shadow-btn-primary hover:shadow-[0_6px_24px_rgba(255,90,111,0.35)] hover:-translate-y-px active:translate-y-0",
    secondary:
      "bg-white text-primary border-[1.5px] border-primary-disabled hover:bg-primary-soft active:bg-primary-soft",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: 기존 테스트 통과 확인**

```bash
npm test -- --testPathPattern="__tests__" 2>&1 | tail -10
```

Expected: 기존 테스트 전부 pass (Button은 로직 없으므로 테스트 없음)

- [ ] **Step 3: 커밋**

```bash
git add components/Button.tsx
git commit -m "style: redesign Button with gradient primary and hover lift"
```

---

## Task 5: MoodChip 폴리시

**Files:**
- Modify: `components/MoodChip.tsx`

- [ ] **Step 1: border 두께, 폰트 업데이트**

```tsx
// components/MoodChip.tsx
import { MoodKey } from "@/types/matching";

const MOOD_CONFIG: Record<
  MoodKey,
  { label: string; bg: string; text: string; border: string }
> = {
  comfortableTalk: { label: "편한 대화형",        bg: "bg-primary-soft",  text: "text-primary",      border: "border-primary-disabled" },
  activeSocial:    { label: "활발한 친목형",       bg: "bg-mint",          text: "text-mint-ink",     border: "border-mint-ink"         },
  gamesAndDrinks:  { label: "게임/술자리형",       bg: "bg-amber",         text: "text-amber-ink",    border: "border-amber-ink"        },
  respectfulSafe:  { label: "예의/안전 중시형",    bg: "bg-lavender",      text: "text-lavender-ink", border: "border-lavender-ink"     },
  naturalIntro:    { label: "자연스러운 소개팅형", bg: "bg-sky",           text: "text-sky-ink",      border: "border-sky-ink"          },
};

type Props = {
  mood: MoodKey;
  selected?: boolean;
  onClick?: () => void;
};

export function MoodChip({ mood, selected = false, onClick }: Props) {
  const cfg = MOOD_CONFIG[mood];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center px-4 py-2 rounded-full text-xs font-bold border-[1.5px] transition-all
        ${
          selected
            ? `${cfg.bg} ${cfg.text} ${cfg.border}`
            : "bg-white text-muted border-hairline hover:border-body hover:text-ink"
        }
      `}
    >
      {cfg.label}
    </button>
  );
}

export { MOOD_CONFIG };
```

- [ ] **Step 2: 커밋**

```bash
git add components/MoodChip.tsx
git commit -m "style: polish MoodChip border weight and font-bold"
```

---

## Task 6: QuizCard 리디자인

**Files:**
- Modify: `components/QuizCard.tsx`

- [ ] **Step 1: 그라디언트 프로그레스바 + 선택지 스타일**

```tsx
// components/QuizCard.tsx
import { QuizQuestion, QuizChoice } from "@/data/questions";

type Props = {
  question: QuizQuestion;
  current: number;
  total: number;
  onSelect: (score: number) => void;
};

export function QuizCard({ question, current, total, onSelect }: Props) {
  const progress = (current / total) * 100;

  return (
    <div className="bg-white rounded-card shadow-card p-5 max-w-[560px] w-full mx-auto">
      {/* Progress */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-bold text-primary">질문 {current} / {total}</span>
        <span className="text-[10px] font-bold text-muted">{Math.round(progress)}%</span>
      </div>
      <div className="h-1 bg-surface-soft rounded-full mb-5">
        <div
          className="h-full bg-gradient-to-r from-primary to-[#ff8a65] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      <p className="text-sm font-bold text-ink mb-5 leading-snug">
        <span className="text-primary">Q. </span>
        {question.situation}
      </p>

      {/* Choices */}
      <div className="flex flex-col gap-2.5">
        {question.choices.map((choice: QuizChoice, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(choice.score)}
            className="text-left px-4 py-3 rounded-[12px] border-[1.5px] border-hairline text-sm text-body font-medium hover:border-primary hover:bg-primary-soft hover:text-primary hover:font-bold transition-all min-h-[52px]"
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 기존 퀴즈 테스트 통과 확인**

```bash
npm test -- --testPathPattern="scoring|matching" 2>&1 | tail -10
```

Expected: pass (QuizCard은 순수 UI, 기존 로직 테스트에 영향 없음)

- [ ] **Step 3: 커밋**

```bash
git add components/QuizCard.tsx
git commit -m "style: redesign QuizCard with gradient progress bar"
```

---

## Task 7: 홈 페이지 전면 재작성

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Ultra-minimal splash 레이아웃으로 교체**

```tsx
// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-between px-7 pt-14 pb-10">
      {/* 상단: 로고 */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg shadow-[0_3px_10px_rgba(255,90,111,0.25)]">
            ⚡
          </div>
          <span className="text-[22px] font-black text-ink tracking-[-0.8px]">부팅</span>
        </div>
        <p className="text-[10px] font-semibold text-muted tracking-[1.5px] uppercase">
          부산대 과팅 서비스
        </p>
      </div>

      {/* 중앙: 일러스트 */}
      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-primary-soft border-2 border-primary-disabled flex items-center justify-center text-[56px] shadow-[0_8px_32px_rgba(255,90,111,0.10)]">
          🎉
        </div>
        <span className="absolute -top-1 -right-1 text-xl">✨</span>
        <span className="absolute -bottom-1 -left-3 text-lg">💬</span>
      </div>

      {/* 하단: 카피 + CTA */}
      <div className="w-full text-center">
        <h1 className="text-[21px] font-black text-ink leading-snug tracking-[-0.6px] mb-1.5">
          당신의 연애세포를
          <br />
          <span className="text-primary">부팅</span>하세요!
        </h1>
        <p className="text-xs text-muted mb-6 leading-relaxed">
          부산대생끼리 팀을 이뤄
          <br />
          딱 맞는 상대팀과 설레는 과팅을
        </p>
        <Link href="/test" className="block mb-3">
          <Button variant="primary" fullWidth>
            성향 테스트 시작하기 →
          </Button>
        </Link>
        <Link href="/team/create" className="text-xs text-muted">
          팀 초대를 받으셨나요?{" "}
          <span className="text-primary font-bold">코드로 합류</span>
        </Link>
      </div>
    </main>
  );
}
```

`Button` import 추가:

```tsx
import { Button } from "@/components/Button";
```

전체 파일:

```tsx
// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/Button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-between px-7 pt-14 pb-10">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg shadow-[0_3px_10px_rgba(255,90,111,0.25)]">
            ⚡
          </div>
          <span className="text-[22px] font-black text-ink tracking-[-0.8px]">부팅</span>
        </div>
        <p className="text-[10px] font-semibold text-muted tracking-[1.5px] uppercase">
          부산대 과팅 서비스
        </p>
      </div>

      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-primary-soft border-2 border-primary-disabled flex items-center justify-center text-[56px] shadow-[0_8px_32px_rgba(255,90,111,0.10)]">
          🎉
        </div>
        <span className="absolute -top-1 -right-1 text-xl">✨</span>
        <span className="absolute -bottom-1 -left-3 text-lg">💬</span>
      </div>

      <div className="w-full text-center">
        <h1 className="text-[21px] font-black text-ink leading-snug tracking-[-0.6px] mb-1.5">
          당신의 연애세포를
          <br />
          <span className="text-primary">부팅</span>하세요!
        </h1>
        <p className="text-xs text-muted mb-6 leading-relaxed">
          부산대생끼리 팀을 이뤄
          <br />
          딱 맞는 상대팀과 설레는 과팅을
        </p>
        <Link href="/test" className="block mb-3">
          <Button variant="primary" fullWidth>
            성향 테스트 시작하기 →
          </Button>
        </Link>
        <Link href="/team/create" className="text-xs text-muted">
          팀 초대를 받으셨나요?{" "}
          <span className="text-primary font-bold">코드로 합류</span>
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 브라우저에서 홈 확인**

`http://localhost:3000` — 로고 + 일러스트 + CTA 2개만 보이는지 확인.  
기존 "어떻게 진행되나요?" 섹션과 무드 칩이 없어야 함.

- [ ] **Step 3: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: redesign home page as ultra-minimal 부팅 splash"
```

---

## Task 8: 성향 테스트 결과 화면 — 점수 바 추가

**Files:**
- Modify: `app/test/page.tsx`

결과 화면의 닉네임 입력 위에 성향 점수 바 4개를 추가한다.  
`finalTraits`는 이미 계산되어 있으므로 로직 변경 없음.

- [ ] **Step 1: 결과 화면 JSX 교체**

`app/test/page.tsx`에서 `showNickname && resultRole` 분기의 return문만 교체:

```tsx
if (showNickname && resultRole) {
  const info = ROLE_LABELS[resultRole];
  const traitLabels: Record<string, string> = {
    atmosphereCoordination: "분위기 조율",
    consideration:          "배려심",
    participation:          "적극성",
    communicationBalance:   "소통 균형",
  };

  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto">
          {/* 역할 결과 */}
          <div className="text-center mb-8">
            <div className="text-[52px] mb-3 drop-shadow-sm">{info.emoji}</div>
            <h2 className="text-2xl font-black text-ink tracking-[-0.5px] mb-2">{info.name}</h2>
            <p className="text-sm text-muted leading-relaxed">{info.desc}</p>
          </div>

          {/* 성향 점수 바 */}
          {finalTraits && (
            <div className="bg-surface-soft rounded-card p-4 mb-6 flex flex-col gap-3">
              {Object.entries(finalTraits).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-muted w-16 shrink-0 text-right">
                    {traitLabels[key] ?? key}
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

          {/* 닉네임 입력 */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-ink mb-2">
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
```

- [ ] **Step 2: 브라우저에서 테스트 플로우 확인**

`http://localhost:3000/test` → 10문항 완료 → 결과 화면에 점수 바 4개 표시 확인

- [ ] **Step 3: 퀴즈 진행 화면 배경색 변경**

같은 파일의 퀴즈 진행 중 return문에서 `bg-canvas-warm` → `bg-white` 로 변경:

```tsx
// 퀴즈 진행 중 return
return (
  <>
    <AppHeader step={1} totalSteps={3} />
    <main className="py-10 px-4 bg-white min-h-screen">  {/* bg-canvas-warm → bg-white */}
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
```

- [ ] **Step 4: 커밋**

```bash
git add app/test/page.tsx
git commit -m "style: add trait score bars to test result, polish quiz screen"
```

---

## Task 9: TeamProfileCard 폴리시

**Files:**
- Modify: `components/TeamProfileCard.tsx`

- [ ] **Step 1: 아바타 그라디언트 + 구분선 + 팀장 뱃지 스타일**

```tsx
// components/TeamProfileCard.tsx
import { TeamProfile, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";

const ROLE_INFO: Record<MemberRole, { label: string; emoji: string }> = {
  moodMaker:   { label: "분위기 메이커형", emoji: "🔥" },
  coordinator: { label: "조율자형",         emoji: "🎯" },
  considerate: { label: "배려형",           emoji: "🤍" },
  reactor:     { label: "리액션형",         emoji: "✨" },
};

type Props = { team: TeamProfile };

export function TeamProfileCard({ team }: Props) {
  const initials = team.teamName.slice(0, 2);

  return (
    <div className="bg-white rounded-card shadow-card p-5 max-w-[480px] w-full">
      {/* 팀 아이덴티티 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg font-black text-white shadow-[0_3px_10px_rgba(255,90,111,0.25)] shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="text-[18px] font-black text-ink tracking-[-0.4px]">{team.teamName}</h2>
          <p className="text-xs text-muted mt-0.5">
            {team.school} · {team.size}명 · {team.ageRange}세
          </p>
        </div>
      </div>

      {/* 분위기 */}
      <div className="mb-4">
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">원하는 분위기</p>
        <MoodChip mood={team.mood} selected />
      </div>

      {/* 팀원 */}
      <div>
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">팀원 구성</p>
        <div className="flex flex-col">
          {team.members.map((m, i) => {
            const info = ROLE_INFO[m.role];
            return (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-hairline-soft last:border-0"
              >
                <span className="text-sm font-semibold text-ink flex items-center gap-1.5">
                  {m.nickname}
                  {m.isLeader && (
                    <span className="text-[10px] text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded-full">
                      팀장
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {info.emoji} {info.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/TeamProfileCard.tsx
git commit -m "style: polish TeamProfileCard with gradient avatar and dividers"
```

---

## Task 10: 매칭 관련 컴포넌트 폴리시

**Files:**
- Modify: `components/MatchScoreCard.tsx`
- Modify: `components/MatchReasonList.tsx`
- Modify: `components/RecommendationTeamCard.tsx`

- [ ] **Step 1: MatchScoreCard — 레이블 한국어화**

```tsx
// components/MatchScoreCard.tsx
import { MatchResult } from "@/types/matching";

const LABEL_COLORS: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "text-primary",
  "Good with some differences":       "text-amber-ink",
  "Different atmosphere preferences": "text-muted",
};

const LABEL_KO: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "분위기 완벽 일치",
  "Good with some differences":       "대체로 잘 맞아요",
  "Different atmosphere preferences": "스타일이 조금 달라요",
};

type Props = { score: number; label: MatchResult["label"] };

export function MatchScoreCard({ score, label }: Props) {
  return (
    <div className="text-right shrink-0">
      <p className="text-[32px] font-black text-primary leading-none tracking-[-1px]">
        {score}
        <span className="text-base">%</span>
      </p>
      <p className="text-[10px] font-bold text-muted mt-0.5">궁합 점수</p>
      <p className={`text-[10px] font-semibold mt-0.5 ${LABEL_COLORS[label]}`}>
        {LABEL_KO[label]}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: MatchReasonList — 아이콘 + 텍스트 스타일**

```tsx
// components/MatchReasonList.tsx
type Props = { reasons: string[] };

export function MatchReasonList({ reasons }: Props) {
  return (
    <ul className="flex flex-col gap-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-body leading-snug">
          <span className="text-primary shrink-0 mt-0.5">✓</span>
          {r}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: RecommendationTeamCard — rank 강조 + 아바타 그라디언트**

```tsx
// components/RecommendationTeamCard.tsx
import { MatchResult, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";
import { MatchScoreCard } from "./MatchScoreCard";
import { MatchReasonList } from "./MatchReasonList";

const ROLE_EMOJI: Record<MemberRole, string> = {
  moodMaker: "🔥", coordinator: "🎯", considerate: "🤍", reactor: "✨",
};

const RANK_GRADIENTS = [
  "from-primary to-[#ff7e5f]",
  "from-[#7c5cbf] to-[#a07ee8]",
  "from-[#1da462] to-[#34d978]",
];

type Props = { result: MatchResult; rank: number };

export function RecommendationTeamCard({ result, rank }: Props) {
  const { team, score, label, reasons } = result;
  const initials = team.teamName.slice(0, 2);
  const gradient = RANK_GRADIENTS[(rank - 1) % RANK_GRADIENTS.length];
  const isTop = rank === 1;

  return (
    <div
      className={`bg-white rounded-card p-5 flex flex-col gap-3.5 ${
        isTop
          ? "shadow-[0_4px_20px_rgba(255,90,111,0.15),0_0_0_1.5px_#ffd6dd]"
          : "shadow-card"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-[12px] bg-gradient-to-br ${gradient} flex items-center justify-center text-sm font-black text-white shrink-0`}
          >
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {rank <= 3 && (
                <span
                  className={`text-[10px] font-black text-white rounded-full px-2 py-0.5 bg-gradient-to-r ${gradient}`}
                >
                  #{rank}
                </span>
              )}
              <h3 className="text-sm font-black text-ink">{team.teamName}</h3>
            </div>
            <p className="text-[10px] text-muted">
              {team.school} · {team.size}명 · {team.ageRange}세
            </p>
          </div>
        </div>
        <MatchScoreCard score={score} label={label} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MoodChip mood={team.mood} selected />
        {team.members.slice(0, 4).map((m, i) => (
          <span key={i} className="text-base" title={m.role}>
            {ROLE_EMOJI[m.role]}
          </span>
        ))}
      </div>

      <MatchReasonList reasons={reasons} />
    </div>
  );
}
```

- [ ] **Step 4: 브라우저에서 `/match` 확인**

팀을 만든 후 `http://localhost:3000/match` — 1위 카드에 핑크 테두리, 그라디언트 아바타 확인

- [ ] **Step 5: 커밋**

```bash
git add components/MatchScoreCard.tsx components/MatchReasonList.tsx components/RecommendationTeamCard.tsx
git commit -m "style: polish match result cards with gradient avatars and KO labels"
```

---

## Task 11: 팀 만들기 페이지 폴리시

**Files:**
- Modify: `app/team/create/page.tsx`

인풋·분위기 선택·팀원 카드의 시각적 스타일만 업데이트. 로직 변경 없음.

- [ ] **Step 1: 인풋 스타일 클래스 업데이트**

파일 전체에서 다음 클래스를 치환:

| 기존 | 변경 |
|------|------|
| `border border-hairline rounded-sm px-4 h-12 text-base text-ink focus:outline-none focus:border-primary` | `border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white` |
| `border border-dashed border-hairline rounded-md py-3 text-sm text-muted hover:border-primary hover:text-primary transition-colors` | `border-[1.5px] border-dashed border-hairline rounded-[12px] py-3 text-sm text-muted hover:border-primary hover:text-primary transition-colors` |
| `border border-primary bg-primary-soft rounded-md p-4 text-sm` | `bg-gradient-to-br from-primary-soft to-[#fff0f4] border-[1.5px] border-primary-disabled rounded-[14px] p-4 text-sm` |

- [ ] **Step 2: 섹션 라벨 스타일 업데이트**

파일 전체에서 `text-sm font-semibold text-ink mb-2` → `text-xs font-bold text-ink mb-2 uppercase tracking-wide` 로 변경 (`label` className 부분만)

- [ ] **Step 3: placeholder 텍스트 변경**

팀 이름 input의 placeholder:
```
"예: 서면 드리머즈" → "예: 컴공 왕자들, 경영 여신들"
```

- [ ] **Step 4: 브라우저에서 `/team/create` 확인**

인풋 테두리 1.5px, 라벨 uppercase, 팀장 카드 그라디언트 배경 확인

- [ ] **Step 5: 커밋**

```bash
git add app/team/create/page.tsx
git commit -m "style: polish team create page inputs and labels"
```

---

## Task 12: 팀 프로필 + 매칭 페이지 폴리시

**Files:**
- Modify: `app/team/demo/page.tsx`
- Modify: `app/match/page.tsx`

- [ ] **Step 1: team/demo 페이지 — 헤더 카피 폴리시**

```tsx
// app/team/demo/page.tsx (폴리시 부분만)
// h1, p 텍스트는 그대로 유지
// bg-canvas-warm → bg-white 변경
<main className="py-10 px-4 bg-white min-h-screen">
```

- [ ] **Step 2: match 페이지 — 헤더 카피 + 배경**

```tsx
// app/match/page.tsx
// bg-canvas-warm → bg-white
// h1 font-black tracking-[-0.5px] 추가
// "추천 과팅 팀" 하단 p → text-xs 로 변경

<main className="py-10 px-4 bg-white min-h-screen">
  <div className="max-w-[640px] mx-auto">
    <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">추천 과팅 팀</h1>
    <p className="text-xs text-muted mb-8">
      <span className="font-bold text-ink">{myTeam.teamName}</span>과 잘 어울릴 팀을 분위기·역할·조건 궁합으로 추천했어요.
    </p>
    {/* 나머지 동일 */}
```

- [ ] **Step 3: 빌드 최종 확인**

```bash
npm run build 2>&1 | tail -10
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 4: 전체 테스트 확인**

```bash
npm test 2>&1 | tail -15
```

Expected: 기존 테스트 전부 pass

- [ ] **Step 5: 최종 커밋**

```bash
git add app/team/demo/page.tsx app/match/page.tsx
git commit -m "style: polish team demo and match pages background and typography"
```

---

## 셀프 리뷰 체크리스트

- [x] **Spec 커버리지**: Task 1~12가 스펙 §2 비주얼 언어, §3-1~3-4, §3-12 매칭 카드 폴리시 전부 커버
- [x] **Placeholder 없음**: 모든 step에 실제 코드 포함
- [x] **타입 일관성**: `MatchResult`, `TeamProfile`, `MemberRole` 모두 기존 `types/matching.ts` 그대로 사용, 변경 없음
- [x] **누락 없음**: MoodChip(Task 5), Button(Task 4), AppHeader(Task 3) 공통 컴포넌트 먼저 처리 후 페이지 적용 순서로 의존성 충족
