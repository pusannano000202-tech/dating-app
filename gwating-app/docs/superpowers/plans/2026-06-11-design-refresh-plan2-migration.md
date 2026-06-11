# 디자인 리프레시 Plan 2 — 레거시 페이지 마이그레이션 + 정리 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레거시 9개 화면(test, team/create, team/demo, match 5종) 전부를 Warm Paper × Electric 디자인 시스템 위로 옮기고, 레거시 컴포넌트·토큰을 제거한다.

**Architecture:** Plan 1의 프리미티브(PageShell/Button/Card/Chip/Avatar/AuroraBlob/TabBar/BoltLogo)를 소비. 매칭 확정 이후 화면(confirmed, qa)은 다크 무드. 로직(상태, Supabase, 라우팅 흐름, lib/)은 변경하지 않는다 — 채팅 높이 버그 수정(100vh→h-full) 1건만 예외(승인된 리뷰 이월 항목).

**Tech Stack:** Next.js 14 App Router, Tailwind CSS 3, 순수 CSS 애니메이션.

**스펙:** `docs/superpowers/specs/2026-06-10-design-refresh-design.md` / 시각 기준: 같은 폴더의 showcase·motion-spec HTML.

**Plan 1 리뷰 이월 항목 (이 플랜에서 해소):**
1. `app/match/chat` `h-[calc(100vh-44px)]` → 모바일 키보드 버그 (Task 10)
2. `<Link><Button>` 중첩 (잘못된 HTML) → `ButtonLink` 도입 (Task 1)
3. 레거시 카드 그림자/토큰 수렴 → 마이그레이션으로 자연 해소, 토큰 제거 (Task 11)

**검증 방식:** Plan 1과 동일 — 신규 단위 테스트 없음. 회귀선은 기존 jest 5 suites + `npm run build` + dev 서버 시각 대조. 모든 명령은 `gwating-app/` 루트에서. 빌드가 5분 이상 행이면 전날 이전에 시작된 좀비 node 프로세스만 골라 종료 후 1회 재시도.

**전 태스크 공통 규칙:**
- 코드는 제시된 그대로 붙여넣기 (개선 금지). 빌드 실패 시 최소 수정 + 보고.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 추가.
- 명시된 파일 외 수정 금지.

---

### Task 1: 파운데이션 확장 — Button 리팩터(+glass, ButtonLink), 모션 2종, LockIcon 분리

**Files:**
- Modify: `components/ui/Button.tsx` (전체 교체)
- Create: `components/ui/ButtonLink.tsx`
- Create: `components/ui/LockIcon.tsx`
- Modify: `app/globals.css` (키프레임 2개 추가)
- Modify: `tailwind.config.ts` (animation 1개 추가)
- Modify: `app/page.tsx` (Link>Button 중첩 해소)
- Modify: `app/home/page.tsx` (LockIcon 임포트 전환)

- [ ] **Step 1: `components/ui/Button.tsx` 전체 교체** — 클래스 문자열을 `buttonClassName()`으로 추출(ButtonLink와 공유)하고 다크 화면용 `glass` variant 추가.

```tsx
import { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "ink" | "electric" | "ghost" | "glass";

const BASE =
  "flex h-[56px] select-none items-center justify-center gap-2 rounded-btn px-6 text-[15px] font-bold " +
  "transition-[transform,box-shadow] duration-150 active:scale-[0.965] " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  ink: "bg-ink text-white shadow-ink active:shadow-pressed",
  electric: "bg-electric text-white shadow-glow active:shadow-pressed",
  ghost: "bg-transparent font-semibold text-muted shadow-none",
  glass:
    "border border-[#F2EEE7]/15 bg-[#F2EEE7]/[0.07] text-[#F2EEE7] backdrop-blur-md shadow-none",
};

export function buttonClassName(
  variant: ButtonVariant = "ink",
  fullWidth = false,
  className = ""
) {
  return `${BASE} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Button({
  variant = "ink",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button className={buttonClassName(variant, fullWidth, className)} {...props}>
      {children}
    </button>
  );
}
```

- [ ] **Step 2: `components/ui/ButtonLink.tsx` 생성** — 앵커를 버튼처럼 스타일링 (버튼-인-앵커 중첩 제거용).

```tsx
import Link from "next/link";
import { ComponentProps } from "react";
import { buttonClassName, ButtonVariant } from "./Button";

type Props = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function ButtonLink({
  variant = "ink",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <Link className={buttonClassName(variant, fullWidth, className)} {...props}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 3: `components/ui/LockIcon.tsx` 생성** (home/result 공용)

```tsx
type Props = { className?: string };

export function LockIcon({ className = "" }: Props) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#B5AFA4"
      strokeWidth="2.4"
      aria-hidden="true"
      className={className}
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
```

- [ ] **Step 4: `app/globals.css`에 키프레임 2개 추가** — `@keyframes chip-pop { ... }` 블록 바로 아래에 삽입:

```css
@keyframes floaty {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes ring-draw {
  from { stroke-dashoffset: 414.69; }
}
```

- [ ] **Step 5: `tailwind.config.ts`의 `animation` 블록에 1줄 추가** (`typing: ...` 줄 뒤):

```ts
        floaty: "floaty 3.4s ease-in-out infinite",
```

- [ ] **Step 6: `app/page.tsx`에서 Link>Button 중첩 해소** — import에 `ButtonLink` 추가(`Button` import 제거), CTA 블록 교체:

기존:
```tsx
        <Link href="/test" className="block animate-rise [animation-delay:1.35s]">
          <Button variant="ink" fullWidth className="animate-glow-breathe">
            시작하기 <BoltLogo size={16} variant="electric" />
          </Button>
        </Link>
```
교체:
```tsx
        <div className="animate-rise [animation-delay:1.35s]">
          <ButtonLink href="/test" variant="ink" fullWidth className="animate-glow-breathe">
            시작하기 <BoltLogo size={16} variant="electric" />
          </ButtonLink>
        </div>
```
import 줄 `import { Button } from "@/components/ui/Button";` → `import { ButtonLink } from "@/components/ui/ButtonLink";`

- [ ] **Step 7: `app/home/page.tsx`에서 로컬 `LockIcon` 함수 삭제** 후 `import { LockIcon } from "@/components/ui/LockIcon";` 추가 (JSX 사용부는 동일하므로 무변경).

- [ ] **Step 8: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 모두 통과

```bash
git add components/ui/Button.tsx components/ui/ButtonLink.tsx components/ui/LockIcon.tsx app/globals.css tailwind.config.ts app/page.tsx app/home/page.tsx
git commit -m "feat: extend design system with ButtonLink, glass variant, floaty/ring motions"
```

---

### Task 2: AppHeader + MoodChip 리뉴얼

**Files:**
- Modify: `components/AppHeader.tsx` (전체 교체)
- Modify: `components/MoodChip.tsx` (전체 교체)

- [ ] **Step 1: `components/AppHeader.tsx` 전체 교체** (이모지 박스 → BoltLogo, 글래스 헤더)

```tsx
import Link from "next/link";
import { BoltLogo } from "@/components/ui/BoltLogo";

type Props = {
  step?: number;
  totalSteps?: number;
};

export function AppHeader({ step, totalSteps }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <BoltLogo size={18} />
          <span className="text-[15px] font-black tracking-[-0.5px] text-ink">부팅</span>
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

- [ ] **Step 2: `components/MoodChip.tsx` 전체 교체** — 무드별 5색 → ui/Chip 일렉트릭 하이라이트로 통일. 임포트 지점(MoodSelector, TeamProfileCard)은 그대로 동작. `MOOD_CONFIG` export는 사용처가 없으므로 `MOOD_LABELS`로 대체.

```tsx
import { MoodKey } from "@/types/matching";
import { Chip } from "./ui/Chip";

export const MOOD_LABELS: Record<MoodKey, string> = {
  comfortableTalk: "편한 대화형",
  activeSocial: "활발한 친목형",
  gamesAndDrinks: "게임/술자리형",
  respectfulSafe: "예의/안전 중시형",
  naturalIntro: "자연스러운 소개팅형",
};

type Props = {
  mood: MoodKey;
  selected?: boolean;
  onClick?: () => void;
};

export function MoodChip({ mood, selected = false, onClick }: Props) {
  return (
    <Chip selected={selected} onClick={onClick}>
      {MOOD_LABELS[mood]}
    </Chip>
  );
}
```

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` → 통과

```bash
git add components/AppHeader.tsx components/MoodChip.tsx
git commit -m "feat: restyle AppHeader and unify MoodChip on design-system Chip"
```

---

### Task 3: 성향 테스트 `/test` 리뉴얼

**Files:**
- Modify: `app/test/page.tsx` (전체 교체)

로직(상태 머신, 점수 계산, saveUser)은 그대로 유지하고 렌더링만 교체한다. `QuizCard` 임포트가 사라진다(컴포넌트 삭제는 Task 11). 질문 전환마다 `key={currentIdx}`로 PageShell을 리마운트해 스태거를 재생한다(스펙의 "질문 전환마다 스태거 재생").

- [ ] **Step 1: `app/test/page.tsx` 전체 교체:**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { questions } from "@/data/questions";
import { saveUser } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { TraitKey, MemberRole, UserProfile, Gender } from "@/types/matching";

const ROLE_LABELS: Record<MemberRole, { name: string; desc: string }> = {
  moodMaker:   { name: "분위기 메이커형", desc: "에너지를 끌어올리고 자리를 살려주는 역할이에요." },
  coordinator: { name: "조율자형",        desc: "대화 흐름을 이어주고 균형을 맞추는 역할이에요." },
  considerate: { name: "배려형",          desc: "모두를 세심하게 챙기는 역할이에요." },
  reactor:     { name: "리액션형",        desc: "분위기를 살려주는 반응으로 자리를 따뜻하게 해요." },
};

const TRAIT_LABELS: Record<string, string> = {
  atmosphereCoordination: "분위기 조율",
  consideration:          "배려심",
  participation:          "적극성",
  respectfulness:         "예의/존중",
  communicationBalance:   "소통 균형",
};

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "남자" },
  { value: "female", label: "여자" },
];

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
        <PageShell className="pt-8">
          <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ START</p>
          <h2 className="mt-2 text-[26px] font-black leading-[1.3] tracking-[-1px]">
            먼저 성별을
            <br />
            알려주세요
          </h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-muted">
            팀 매칭에만 사용돼요.
            <br />
            <span className="text-xs text-muted/60">매칭 외 목적으로 사용되지 않아요</span>
          </p>
          <div className="mt-8 flex gap-3">
            {GENDER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                className={`flex-1 rounded-card border-[1.5px] py-7 text-center text-base font-extrabold transition-all active:scale-[0.97] ${
                  gender === value
                    ? "chip-pop border-[#FF4D3D] bg-[#FFF6F1] text-[#E5402E] shadow-[0_10px_22px_rgba(255,77,61,0.16)]"
                    : "border-line bg-white text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-auto pt-8">
            <Button fullWidth disabled={!gender} onClick={handleGenderNext}>
              다음 — 성향 테스트 시작
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  // ── 결과 ──
  if (step === "result" && resultRole) {
    const info = ROLE_LABELS[resultRole];

    return (
      <>
        <AppHeader step={1} totalSteps={3} />
        <PageShell className="pt-8">
          <p className="text-center text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">
            ✦ RESULT
          </p>
          <h2 className="mt-2 text-center text-[26px] font-black tracking-[-1px]">{info.name}</h2>
          <p className="mt-2 text-center text-sm font-medium leading-relaxed text-muted">
            {info.desc}
          </p>

          {finalTraits && (
            <Card className="mt-7 flex flex-col gap-3.5">
              {Object.entries(finalTraits).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-right text-[10px] font-bold text-muted">
                    {TRAIT_LABELS[key] ?? key}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1EDE6]">
                    <div
                      className="h-full rounded-full bg-electric transition-all duration-500"
                      style={{ width: `${(value / 5) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-[10px] font-black text-[#E5402E]">
                    {value * 20}
                  </span>
                </div>
              ))}
            </Card>
          )}

          <div className="mt-6">
            <label className="mb-2 block text-[10px] font-extrabold tracking-[2px] text-muted">
              닉네임을 입력해주세요
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 민준"
              maxLength={10}
              className="h-12 w-full rounded-btn border-[1.5px] border-line bg-white px-4 text-base text-ink focus:border-[#FF9D7E] focus:outline-none"
            />
          </div>
          <div className="mt-auto pt-6">
            <Button fullWidth onClick={handleSave} disabled={!nickname.trim()}>
              팀 만들러 가기
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  // ── 퀴즈 ──
  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <PageShell key={currentIdx} className="pt-6">
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= currentIdx ? "bg-electric" : "bg-ink/10"
              }`}
            />
          ))}
        </div>
        <p className="mt-8 text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">
          ✦ QUESTION {String(currentIdx + 1).padStart(2, "0")}
        </p>
        <h1 className="mt-2 text-2xl font-black leading-[1.35] tracking-[-0.8px]">
          {current.situation}
        </h1>
        <div className="mt-7 flex flex-col gap-3">
          {current.choices.map((choice, i) => (
            <Card
              key={i}
              pressable
              onClick={() => handleSelect(choice.score)}
              className="px-[18px] py-4"
            >
              <p className="text-sm font-bold leading-snug">{choice.text}</p>
            </Card>
          ))}
        </div>
        <p className="mt-auto pt-6 text-center text-[10px] font-semibold text-muted">
          {currentIdx + 1} / {questions.length}
        </p>
      </PageShell>
    </>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add app/test/page.tsx
git commit -m "feat: rebuild personality test on Warm Paper design system"
```

---

### Task 4: 팀 만들기 `/team/create` 리뉴얼

**Files:**
- Modify: `app/team/create/page.tsx` (전체 교체)

- [ ] **Step 1: `app/team/create/page.tsx` 전체 교체** (로직 동일, 렌더링만 교체):

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { MoodSelector } from "@/components/MoodSelector";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageShell } from "@/components/ui/PageShell";
import { loadUser, saveTeam } from "@/lib/storage";
import { classifyRole } from "@/lib/scoring";
import { MoodKey, TeamProfile, TeamMember, Gender } from "@/types/matching";

const ROLE_LABELS: Record<string, string> = {
  moodMaker: "분위기 메이커형",
  coordinator: "조율자형",
  considerate: "배려형",
  reactor: "리액션형",
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
        <PageShell className="items-center justify-center text-center">
          <p className="text-sm font-medium leading-relaxed text-muted">
            성향 테스트를 먼저 완료해야
            <br />팀을 만들 수 있어요.
          </p>
          <div className="mt-6 w-full">
            <Button fullWidth onClick={() => router.push("/test")}>
              성향 테스트 하러 가기
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  const inputCls =
    "h-12 w-full rounded-btn border-[1.5px] border-line bg-white px-4 text-base text-ink focus:border-[#FF9D7E] focus:outline-none";
  const labelCls = "mb-2 block text-[10px] font-extrabold tracking-[2px] text-muted";

  return (
    <>
      <AppHeader step={2} totalSteps={3} />
      <PageShell className="pt-7">
        <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ TEAM</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.8px]">팀 만들기</h1>
        <p className="mt-1 text-xs font-medium text-muted">팀 정보를 채우고 친구를 초대해요</p>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-6">
          <div>
            <label className={labelCls}>
              팀 이름 <span className="text-[#E5402E]">*</span>
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="예: 컴공 왕자들, 경영 여신들"
              maxLength={20}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              나이대 <span className="text-[#E5402E]">*</span>
            </label>
            <input
              type="text"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              placeholder="예: 22~24"
              maxLength={10}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              원하는 과팅 분위기 <span className="text-[#E5402E]">*</span>
            </label>
            <MoodSelector value={mood} onChange={setMood} />
          </div>

          <div>
            <label className={labelCls}>팀장 (나)</label>
            <Card className="flex items-center gap-3 p-4">
              <Avatar label={leader.nickname.slice(0, 1)} />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold">{leader.nickname}</span>
                  <span className="rounded-full bg-electric px-1.5 py-0.5 text-[9px] font-bold text-white">
                    팀장
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted">
                  {leader.gender && <span>{GENDER_LABELS[leader.gender]}</span>}
                  {leader.gender && <span>·</span>}
                  <span>{ROLE_LABELS[leader.role]}</span>
                </div>
              </div>
            </Card>
          </div>

          <div>
            <label className={labelCls}>팀원 초대</label>

            <Card className="mb-3 flex items-center gap-3 p-4">
              <div className="flex-1">
                <div className="text-[10px] font-extrabold tracking-[2px] text-muted">
                  초대 코드
                </div>
                <div className="font-mono text-lg font-black tracking-[3px]">{inviteCode}</div>
              </div>
              <Chip selected={copied} onClick={handleCopyCode}>
                {copied ? "복사됨!" : "복사"}
              </Chip>
            </Card>

            <div className="mb-2 flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-card border border-dashed border-[#D8D2C7] bg-white/60 p-4"
                >
                  <Avatar frost className="h-9 w-9" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-muted">대기 중…</div>
                    <div className="text-[10px] font-semibold text-[#FF8A5C]">초대 수락 대기</div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-[10px] font-medium leading-relaxed text-muted">
              초대 코드를 친구에게 공유하면 팀원이 합류해요
              <br />
              <span className="text-muted/60">(현재 코드 공유 기능은 준비 중이에요)</span>
            </p>
          </div>

          <Button type="submit" fullWidth disabled={!isValid}>
            팀 프로필 만들기
          </Button>
        </form>
      </PageShell>
    </>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add app/team/create/page.tsx
git commit -m "feat: rebuild team create page on design system"
```

---

### Task 5: 팀 프로필(마이 탭) — TeamProfileCard + `/team/demo`

**Files:**
- Modify: `components/TeamProfileCard.tsx` (전체 교체)
- Modify: `app/team/demo/page.tsx` (전체 교체)

- [ ] **Step 1: `components/TeamProfileCard.tsx` 전체 교체** (이모지 제거, Avatar/Card/새 토큰):

```tsx
import { TeamProfile, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";
import { Avatar } from "./ui/Avatar";
import { Card } from "./ui/Card";

const ROLE_LABELS: Record<MemberRole, string> = {
  moodMaker: "분위기 메이커형",
  coordinator: "조율자형",
  considerate: "배려형",
  reactor: "리액션형",
};

type Props = { team: TeamProfile };

export function TeamProfileCard({ team }: Props) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar label={team.teamName.slice(0, 1)} className="h-12 w-12 text-base" />
        <div>
          <h2 className="text-lg font-extrabold tracking-[-0.4px]">{team.teamName}</h2>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {team.school} · {team.size}명 · {team.ageRange}세
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {team.maleCount !== undefined && team.maleCount > 0 && (
              <span className="rounded-full border border-line bg-[#F7F4EE] px-2 py-0.5 text-[10px] font-bold text-[#6E675C]">
                남 {team.maleCount}
              </span>
            )}
            {team.femaleCount !== undefined && team.femaleCount > 0 && (
              <span className="rounded-full border border-[#FF9D7E] bg-[#FFF0EA] px-2 py-0.5 text-[10px] font-bold text-[#E5402E]">
                여 {team.femaleCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-extrabold tracking-[2px] text-muted">원하는 분위기</p>
        <MoodChip mood={team.mood} selected />
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[10px] font-extrabold tracking-[2px] text-muted">팀원 구성</p>
        <div className="flex flex-col">
          {team.members.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                {m.nickname}
                {m.isLeader && (
                  <span className="rounded-full bg-electric px-1.5 py-0.5 text-[9px] font-bold text-white">
                    팀장
                  </span>
                )}
              </span>
              <span className="text-xs font-medium text-muted">{ROLE_LABELS[m.role]}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: `app/team/demo/page.tsx` 전체 교체** (마이 탭 — TabBar 추가, AppHeader 제거):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TeamProfileCard } from "@/components/TeamProfileCard";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
import { loadTeam } from "@/lib/storage";
import { TeamProfile } from "@/types/matching";

export default function TeamDemoPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTeam(loadTeam());
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!team) {
    return (
      <>
        <PageShell withTabBar className="items-center justify-center text-center">
          <p className="text-sm font-medium leading-relaxed text-muted">
            팀 정보가 없어요.
            <br />팀을 먼저 만들어주세요.
          </p>
          <div className="mt-6 w-full">
            <Button fullWidth onClick={() => router.push("/team/create")}>
              팀 만들러 가기
            </Button>
          </div>
        </PageShell>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <PageShell withTabBar>
        <div>
          <p className="text-xs font-semibold text-muted">이 팀으로 매칭을 진행해요</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.8px]">내 팀</h1>
        </div>
        <div className="mt-5">
          <TeamProfileCard team={team} />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button fullWidth onClick={() => router.push("/match")}>
            매칭 팀 찾기
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.push("/team/create")}>
            팀 수정하기
          </Button>
        </div>
      </PageShell>
      <TabBar />
    </>
  );
}
```

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add components/TeamProfileCard.tsx app/team/demo/page.tsx
git commit -m "feat: rebuild team profile as My tab with TabBar"
```

---

### Task 6: ChemiRing + 매칭 결과 `/match/result`

**Files:**
- Create: `components/ui/ChemiRing.tsx`
- Modify: `app/match/result/page.tsx` (전체 교체)

- [ ] **Step 1: `components/ui/ChemiRing.tsx` 생성** — 그라디언트 링 드로잉(키프레임 `ring-draw`는 Task 1에서 추가됨, 둘레 상수 414.69와 일치).

```tsx
import { useId } from "react";

const CIRCUMFERENCE = 414.69; // 2π × r(66) — globals.css의 ring-draw from 값과 일치

type Props = {
  score: number;
  label?: string;
  className?: string;
};

export function ChemiRing({ score, label = "CHEMI", className = "" }: Props) {
  const gradientId = useId();
  const clamped = Math.min(100, Math.max(0, score));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div className={`relative h-[172px] w-[172px] animate-floaty ${className}`}>
      <svg width="172" height="172" viewBox="0 0 172 172" className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF3D5A" />
            <stop offset="1" stopColor="#FF7A3D" />
          </linearGradient>
        </defs>
        <circle cx="86" cy="86" r="66" fill="none" stroke="rgba(27,25,22,0.07)" strokeWidth="13" />
        <circle
          cx="86"
          cy="86"
          r="66"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ animation: "ring-draw 1.6s cubic-bezier(0.22,1,0.36,1) 0.3s both" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="text-[46px] font-black leading-none tracking-[-2px] text-ink">{clamped}</b>
        <span className="mt-1 text-[11px] font-bold tracking-[1px] text-muted">{label}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `app/match/result/page.tsx` 전체 교체** (매칭 탭 — TabBar, 일렉트릭 CTA는 이 화면이 핵심 액션):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChemiRing } from "@/components/ui/ChemiRing";
import { LockIcon } from "@/components/ui/LockIcon";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { loadTeam, saveMatchFlow } from "@/lib/storage";
import { rankTeams } from "@/lib/matching";
import { mockTeams } from "@/data/mockTeams";
import { TeamProfile } from "@/types/matching";
import { MatchFlowState } from "@/types/match-flow";

export default function MatchResultPage() {
  const router = useRouter();
  const [myTeam, setMyTeam] = useState<TeamProfile | null>(null);
  const [flow, setFlow] = useState<MatchFlowState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const team = loadTeam();
    if (!team) { setLoading(false); return; }
    setMyTeam(team);
    const results = rankTeams(team, mockTeams);
    if (results.length === 0) { setLoading(false); return; }
    const best = results[0];

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
    setFlow(state);
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!myTeam || !flow) {
    return (
      <>
        <PageShell withTabBar className="items-center justify-center text-center">
          <p className="text-sm font-medium leading-relaxed text-muted">
            팀 정보가 없어요.
            <br />팀을 먼저 만들어주세요.
          </p>
          <div className="mt-6 w-full">
            <Button fullWidth onClick={() => router.push("/team/create")}>
              팀 만들러 가기
            </Button>
          </div>
        </PageShell>
        <TabBar />
      </>
    );
  }

  const { matchedTeam } = flow;

  return (
    <>
      <PageShell withTabBar className="items-center text-center">
        <AuroraBlob className="-left-24 -top-16 h-56 w-56 bg-[#FF3D5A]/10" />
        <p className="mt-5 text-[10px] font-extrabold tracking-[3.5px] text-[#FF6A4E]">
          ✦ MATCH FOUND
        </p>
        <div className="mt-5">
          <ChemiRing score={flow.score} />
        </div>
        <h1 className="mt-5 text-[21px] font-black tracking-[-0.6px]">매칭됐어요!</h1>
        <p className="mt-1 text-sm font-medium text-muted">딱 맞는 팀을 찾았어요</p>

        <div className="mt-6 flex w-full flex-col gap-2.5 text-left">
          <Card className="flex items-center justify-between p-4">
            <span className="text-[10px] font-extrabold tracking-[2px] text-muted">학과</span>
            <span className="text-sm font-extrabold text-ink">경영학과</span>
          </Card>
          <Card className="flex items-center justify-between p-4">
            <span className="text-[10px] font-extrabold tracking-[2px] text-muted">나이대</span>
            <span className="text-sm font-extrabold text-ink">{matchedTeam.ageRange}세</span>
          </Card>
          <Card className="flex items-center justify-between p-4">
            <span className="text-[10px] font-extrabold tracking-[2px] text-muted">성별 구성</span>
            <span className="flex gap-1.5">
              <span className="rounded-full border border-[#FF9D7E] bg-[#FFF0EA] px-2 py-0.5 text-[11px] font-bold text-[#E5402E]">
                여 {matchedTeam.femaleCount}명
              </span>
              <span className="rounded-full border border-line bg-[#F7F4EE] px-2 py-0.5 text-[11px] font-bold text-[#6E675C]">
                남 {matchedTeam.maleCount}명
              </span>
            </span>
          </Card>
        </div>

        <Card className="mt-3 w-full p-4 text-left">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
            <LockIcon /> 상대팀 이름은 아직 비공개예요
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-muted">
            날짜를 정하고, 만남 전까지 하루씩 Q&A로 알아가요
          </p>
        </Card>

        <div className="mt-auto w-full pt-6">
          <Button variant="electric" fullWidth onClick={() => router.push("/match/schedule")}>
            만날 날짜 정하러 가기
          </Button>
        </div>
      </PageShell>
      <TabBar />
    </>
  );
}
```

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add components/ui/ChemiRing.tsx app/match/result/page.tsx
git commit -m "feat: add ChemiRing and rebuild match result page"
```

---

### Task 7: 일정 선택 `/match/schedule`

**Files:**
- Modify: `app/match/schedule/page.tsx` (전체 교체)

- [ ] **Step 1: `app/match/schedule/page.tsx` 전체 교체** (로직 동일):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
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
        <PageShell className="pt-7">
          <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ SCHEDULE</p>
          <h1 className="mt-2 text-2xl font-black leading-[1.3] tracking-[-0.8px]">
            가능한 시간을
            <br />
            골라주세요
          </h1>
          <p className="mt-2 text-xs font-medium text-muted">
            두 팀이 겹치는 가장 빠른 시간으로 자동 확정돼요
          </p>
          <div className="mt-7 grid grid-cols-3 gap-2.5">
            {TIME_SLOTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTime(t)}
                className={`rounded-btn border-[1.5px] py-3.5 text-sm font-bold transition-all active:scale-[0.97] ${
                  selectedTimes.includes(t)
                    ? "border-transparent bg-electric text-white shadow-glow"
                    : "border-line bg-white text-muted"
                }`}
              >
                오후 {parseInt(t) - 12 > 0 ? parseInt(t) - 12 : parseInt(t)}시
              </button>
            ))}
          </div>
          <p className="mt-5 text-center text-[10px] font-semibold text-muted">
            {selectedTimes.length}개 선택됨
          </p>
          <div className="mt-auto pt-6">
            <Button fullWidth disabled={selectedTimes.length === 0} onClick={handleConfirm}>
              확정하기
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <PageShell className="pt-7">
        <p className="text-[10px] font-extrabold tracking-[3px] text-[#FF6A4E]">✦ SCHEDULE</p>
        <h1 className="mt-2 text-2xl font-black leading-[1.3] tracking-[-0.8px]">
          가능한 날짜를
          <br />
          골라주세요
        </h1>
        <p className="mt-2 text-xs font-medium leading-relaxed text-muted">
          한 달 내 가능한 날을 모두 선택해주세요.
          <br />
          <span className="font-bold text-[#E5402E]">●</span> 상대팀도 가능한 날이에요
        </p>
        <div className="mt-6 grid grid-cols-4 gap-2">
          {calendarDays.map((d) => {
            const isMine = selectedDates.includes(d);
            const isBoth = isMine && MOCK_THEIR_DATES.includes(d);
            const isTheirOnly = !isMine && MOCK_THEIR_DATES.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDate(d)}
                className={`relative rounded-[12px] border-[1.5px] py-2.5 text-xs font-bold transition-all active:scale-[0.95] ${
                  isBoth
                    ? "border-transparent bg-electric text-white shadow-glow"
                    : isMine
                    ? "border-[#FF9D7E] bg-[#FFF0EA] text-[#E5402E]"
                    : isTheirOnly
                    ? "border-line bg-white text-ink"
                    : "border-line bg-white text-muted"
                }`}
              >
                {formatDateLabel(d)}
                {isTheirOnly && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-center text-[10px] font-semibold text-muted">
          {selectedDates.length}개 선택됨 · 겹치는 날{" "}
          {selectedDates.filter((d) => MOCK_THEIR_DATES.includes(d)).length}개
        </p>
        <div className="mt-auto pt-6">
          <Button fullWidth disabled={selectedDates.length === 0} onClick={handleDateNext}>
            다음 — 시간 선택
          </Button>
        </div>
      </PageShell>
    </>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add app/match/schedule/page.tsx
git commit -m "feat: rebuild schedule picker on design system"
```

---

### Task 8: 확정 D-day `/match/confirmed` — 다크 무드

**Files:**
- Modify: `app/match/confirmed/page.tsx` (전체 교체)

다크 무드 화면에는 AppHeader(페이퍼 글래스)를 쓰지 않는다 — 풀블리드 다크가 스펙의 연출.

- [ ] **Step 1: `app/match/confirmed/page.tsx` 전체 교체:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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
      <PageShell className="items-center justify-center text-center">
        <p className="text-sm font-medium text-muted">일정 정보가 없어요.</p>
        <div className="mt-6 w-full">
          <Button fullWidth onClick={() => router.push("/match/schedule")}>
            날짜 다시 정하기
          </Button>
        </div>
      </PageShell>
    );
  }

  const team = loadTeam();
  const mood = flow.matchedTeam.mood;
  const questions = team ? QUESTIONS_BY_MOOD[mood] ?? [] : [];
  const daysLeft = getDaysUntil(flow.schedule.confirmedDate);
  const distribution = distributeQuestions(questions.length, Math.max(1, daysLeft));

  return (
    <PageShell mood="dark">
      <AuroraBlob className="-right-24 -top-20 h-72 w-72 bg-[#FF3D5A]/15" />
      <p className="mt-8 text-[10px] font-extrabold tracking-[3.5px] text-[#FFB9A3]">
        ✦ 과팅 확정
      </p>
      <div className="mt-2 animate-shine bg-shine-text bg-[length:200%_auto] bg-clip-text text-[80px] font-black leading-none tracking-[-4px] text-transparent">
        D-{daysLeft}
      </div>
      <p className="mt-3 text-[15px] font-bold text-[#EDE9E2]">
        {formatDate(flow.schedule.confirmedDate)}
        {flow.schedule.confirmedTime && ` · 오후 ${parseInt(flow.schedule.confirmedTime) - 12}시`}
      </p>

      <Card variant="glass" className="mt-7 px-5 py-1">
        <div className="flex items-center justify-between border-b border-[#F2EEE7]/10 py-3.5 text-[13px]">
          <span className="font-semibold text-[#EDE9E2]/50">날짜</span>
          <span className="font-extrabold">{formatDate(flow.schedule.confirmedDate)}</span>
        </div>
        {flow.schedule.confirmedTime && (
          <div className="flex items-center justify-between border-b border-[#F2EEE7]/10 py-3.5 text-[13px]">
            <span className="font-semibold text-[#EDE9E2]/50">시간</span>
            <span className="font-extrabold">
              오후 {parseInt(flow.schedule.confirmedTime) - 12}시
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-3.5 text-[13px]">
          <span className="font-semibold text-[#EDE9E2]/50">장소</span>
          <span className="font-extrabold text-[#FFB9A3]">D-1에 공개돼요</span>
        </div>
      </Card>

      <Card variant="glass" className="mt-3.5">
        <p className="text-[10px] font-extrabold tracking-[2.5px] text-[#FFB9A3]">
          Q&A 공개 일정
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {distribution.map((count, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-10 font-extrabold">D-{daysLeft - i}</span>
              <div className="flex gap-1">
                {Array.from({ length: count }).map((_, j) => (
                  <span
                    key={j}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FF7A3D]/15 text-[8px] font-bold text-[#FFB9A3]"
                  >
                    Q
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-medium text-[#EDE9E2]/45">
          매일 Q&A로 상대팀을 알아가요
        </p>
      </Card>

      <div className="mt-auto pt-6">
        <Button variant="electric" fullWidth onClick={() => router.push("/match/qa")}>
          Q&A 시작하기
        </Button>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add app/match/confirmed/page.tsx
git commit -m "feat: rebuild confirmed page with dark mood and shine countdown"
```

---

### Task 9: Q&A `/match/qa` — 다크 무드

**Files:**
- Modify: `app/match/qa/page.tsx` (전체 교체)

4개 뷰(question/waiting/revealed/history) 전부 다크. AppHeader 미사용.

- [ ] **Step 1: `app/match/qa/page.tsx` 전체 교체:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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
      <PageShell mood="dark">
        <AuroraBlobBg />
        <div className="mt-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF7A3D]/25 bg-[#FF7A3D]/10 px-3 py-1.5 text-[10px] font-bold text-[#FFB9A3]">
            <span className="dot-live h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
            상대팀 답변이 공개됐어요!
          </span>
          <p className="mt-4 text-base font-extrabold leading-snug text-[#F2EEE7]">
            {todayQuestion?.text}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Card variant="glass">
            <p className="text-[9px] font-extrabold tracking-[2px] text-[#FFB9A3]">우리 팀원 답변</p>
            <p className="mt-2 text-sm font-extrabold">{latestAnswer.myAnswer}</p>
          </Card>
          <Card variant="glass">
            <p className="text-[9px] font-extrabold tracking-[2px] text-lilac">상대팀원 답변</p>
            <p className="mt-2 text-sm font-extrabold">{latestAnswer.theirAnswer}</p>
          </Card>
        </div>

        <Card variant="glass" className="mt-3 p-4 text-center">
          <p className="text-xs font-medium leading-relaxed text-[#EDE9E2]/70">
            {getChemistryComment(latestAnswer.myAnswer, latestAnswer.theirAnswer ?? "")}
          </p>
        </Card>

        <div className="mt-auto pt-6">
          <Button variant="glass" fullWidth onClick={() => setView("history")}>
            전체 기록 보기
          </Button>
        </div>
      </PageShell>
    );
  }

  if (view === "history") {
    return (
      <PageShell mood="dark">
        <AuroraBlobBg />
        <p className="mt-6 text-[10px] font-extrabold tracking-[3px] text-[#FFB9A3]">✦ Q&A 기록</p>
        <h1 className="mt-2 text-xl font-black tracking-[-0.6px]">지금까지 나눈 대화</h1>
        <div className="mt-5 flex flex-col gap-3">
          {flow?.qaAnswers.map((a, i) => (
            <Card key={i} variant="glass">
              <p className="text-[10px] font-extrabold tracking-[2px] text-[#EDE9E2]/40">
                Q{i + 1}
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="w-12 shrink-0 text-[10px] font-bold text-[#FFB9A3]">우리팀</span>
                  <span className="text-xs font-medium">{a.myAnswer}</span>
                </div>
                {a.theirAnswer && (
                  <div className="flex items-start gap-2">
                    <span className="w-12 shrink-0 text-[10px] font-bold text-lilac">상대팀</span>
                    <span className="text-xs font-medium">{a.theirAnswer}</span>
                  </div>
                )}
              </div>
              {a.theirAnswer && (
                <p className="mt-2.5 text-[10px] font-medium italic text-[#EDE9E2]/45">
                  {getChemistryComment(a.myAnswer, a.theirAnswer)}
                </p>
              )}
            </Card>
          ))}
        </div>
        {todayQuestion && isMyTurn && (
          <div className="mt-auto pt-6">
            <Button variant="electric" fullWidth onClick={() => setView("question")}>
              오늘 질문 답하기
            </Button>
          </div>
        )}
      </PageShell>
    );
  }

  // 내 차례 아닐 때
  if (!isMyTurn) {
    return (
      <PageShell mood="dark" className="items-center justify-center text-center">
        <AuroraBlobBg />
        <p className="text-[10px] font-extrabold tracking-[3px] text-[#FFB9A3]">✦ 오늘의 질문</p>
        <h2 className="mt-3 text-lg font-black">오늘은 {todayMemberName}님 차례예요</h2>
        <p className="mt-2 text-sm font-medium text-[#EDE9E2]/55">
          답변이 완료되면 대화를 볼 수 있어요
        </p>
        <div className="mt-8 w-full">
          <Button variant="glass" fullWidth onClick={() => setView("history")}>
            이전 기록 보기
          </Button>
        </div>
      </PageShell>
    );
  }

  // 내 차례 + 질문
  const totalQ = QUESTIONS_BY_MOOD[flow?.matchedTeam.mood ?? "comfortableTalk"]?.length ?? 5;
  const answered = flow?.qaAnswers.length ?? 0;

  return (
    <PageShell mood="dark">
      <AuroraBlobBg />
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold tracking-[3px] text-[#FFB9A3]">
            ✦ 오늘의 질문
          </span>
          <span className="text-[10px] font-bold text-[#EDE9E2]/45">
            {answered + 1} / {totalQ}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#F2EEE7]/10">
          <div
            className="h-full rounded-full bg-electric"
            style={{ width: `${(answered / totalQ) * 100}%` }}
          />
        </div>
      </div>

      <h1 className="mt-7 text-[22px] font-black leading-[1.4] tracking-[-0.6px] text-[#F2EEE7]">
        {todayQuestion?.text}
      </h1>

      <div className="mt-6 flex flex-col gap-2.5">
        {todayQuestion?.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setSelectedAnswer(choice)}
            className={`rounded-2xl border-[1.5px] px-4 py-3.5 text-left text-sm font-semibold transition-all active:scale-[0.98] ${
              selectedAnswer === choice
                ? "border-[#FF7A3D] bg-[#FF7A3D]/15 text-white"
                : "border-[#F2EEE7]/10 bg-[#F2EEE7]/[0.05] text-[#EDE9E2]"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Button variant="electric" fullWidth disabled={!selectedAnswer} onClick={handleSubmit}>
          답변 제출하고 상대 보기
        </Button>
      </div>
    </PageShell>
  );
}

function AuroraBlobBg() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 animate-drift rounded-full bg-[#FF3D5A]/12 blur-[58px]"
    />
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add app/match/qa/page.tsx
git commit -m "feat: rebuild QA page with dark mood views"
```

---

### Task 10: 채팅 `/match/chat` — 페이퍼 톤 + 높이 버그 수정

**Files:**
- Modify: `app/match/chat/page.tsx` (전체 교체)

`h-[calc(100vh-44px)]` → `h-full` (레이아웃의 100dvh 체인 사용, 모바일 키보드 버그 해소 — Plan 1 리뷰 이월 항목). Supabase 로직 완전 동일.

- [ ] **Step 1: `app/match/chat/page.tsx` 전체 교체:**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { loadTeam, loadMatchFlow } from "@/lib/storage";

type ChatRow = {
  id: string;
  match_id: string;
  sender: string;
  body: string;
  created_at: string;
};

const DEMO_MATCH_ID = "demo-match";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${m}`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState("");
  const [myName, setMyName] = useState("");
  const [matchId, setMatchId] = useState(DEMO_MATCH_ID);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 내 팀장 닉네임 / match_id 결정
  useEffect(() => {
    const team = loadTeam();
    const leader = team?.members.find((m) => m.isLeader)?.nickname;
    setMyName(leader ?? "우리팀");
    const flow = loadMatchFlow();
    setMatchId(flow?.matchId ?? DEMO_MATCH_ID);
  }, []);

  // 기존 메시지 로드 + Realtime 구독
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경변수가 설정되지 않았어요 (.env.local 확인).");
      setReady(true);
      return;
    }
    const client = supabase;
    let active = true;

    (async () => {
      const { data, error: selErr } = await client
        .from("chat_messages")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (selErr) setError(selErr.message);
      else setMessages((data as ChatRow[]) ?? []);
      setReady(true);
    })();

    const channel = client
      .channel(`chat:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as ChatRow;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          );
        }
      )
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [matchId]);

  // 새 메시지 도착 시 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const body = input.trim();
    if (!body || !isSupabaseConfigured || !supabase) return;
    setInput("");
    const { error: insErr } = await supabase
      .from("chat_messages")
      .insert({ match_id: matchId, sender: myName, body });
    if (insErr) {
      setError(insErr.message);
      setInput(body); // 실패 시 입력 복원
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#F6F2EB]">
      {/* 채팅 헤더 */}
      <div className="flex items-center gap-3 border-b border-line bg-paper/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex-1">
          <div className="text-[13px] font-extrabold tracking-[-0.3px] text-ink">팀장 채팅</div>
          <div className="mt-0.5 text-[10px] font-semibold text-muted">
            약속 조율용 · 오늘만 열려요
          </div>
        </div>
        <span className="rounded-full bg-electric px-2.5 py-1 text-[9px] font-extrabold tracking-[1px] text-white">
          LIVE
        </span>
      </div>

      {/* 메시지 목록 */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
        {error && (
          <div className="rounded-xl border border-[#E5402E]/25 bg-[#FFF0EA] px-3 py-2 text-center text-[11px] font-semibold text-[#C0392B]">
            {error}
          </div>
        )}
        {ready && !error && messages.length === 0 && (
          <div className="py-6 text-center text-[11px] font-medium text-muted">
            아직 메시지가 없어요. 먼저 인사를 건네보세요
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.sender === myName;
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[78%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="px-1.5 text-[9px] font-bold text-muted">{m.sender}</span>
                )}
                <div
                  className={`px-3.5 py-2.5 text-sm font-medium leading-snug ${
                    isMe
                      ? "rounded-[18px] rounded-br-[6px] bg-electric text-white shadow-[0_8px_18px_rgba(255,77,61,0.25)]"
                      : "rounded-[18px] rounded-bl-[6px] border border-line bg-white text-[#2B2722]"
                  }`}
                >
                  {m.body}
                </div>
                <span className="px-1 text-[9px] font-medium text-muted">
                  {formatTime(m.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="flex items-center gap-2.5 border-t border-line bg-paper/85 px-4 py-3 backdrop-blur-xl">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="메시지 입력…"
          disabled={!isSupabaseConfigured}
          className="h-11 flex-1 rounded-full border border-line bg-white px-4 text-sm text-ink focus:border-[#FF9D7E] focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!isSupabaseConfigured || !input.trim()}
          aria-label="보내기"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-electric shadow-glow transition-transform active:scale-90 disabled:opacity-40"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V6M6 12l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add app/match/chat/page.tsx
git commit -m "feat: rebuild chat page with paper tone and fix viewport height"
```

---

### Task 11: 레거시 정리 — 죽은 컴포넌트 삭제 + 토큰 제거

**Files:**
- Delete: `components/Button.tsx`, `components/QuizCard.tsx`, `components/RecommendationTeamCard.tsx`, `components/MatchScoreCard.tsx`, `components/MatchReasonList.tsx`
- Modify: `tailwind.config.ts` (legacy 토큰 제거)
- Modify: `components/SchoolVerifyBadge.tsx` (legacy 클래스 → 새 토큰 매핑)

- [ ] **Step 1: 잔존 참조 확인** — 아래 grep이 **app/, components/, lib/ 안에서 0건**이어야 한다 (docs/는 무시):

```bash
grep -rnE 'from "@/components/Button"|QuizCard|RecommendationTeamCard|MatchScoreCard|MatchReasonList' app components lib
```
1건이라도 나오면 STOP — 해당 태스크가 누락된 것이므로 보고.

- [ ] **Step 2: 파일 5개 삭제**

```bash
git rm components/Button.tsx components/QuizCard.tsx components/RecommendationTeamCard.tsx components/MatchScoreCard.tsx components/MatchReasonList.tsx
```

- [ ] **Step 3: `components/SchoolVerifyBadge.tsx` 클래스 매핑** — 이 컴포넌트는 보류된 기능(도메인 구매 후 재활성화 예정)이라 삭제하지 않는다. 파일을 열어 아래 매핑표에 따라 **className 문자열만** 치환한다 (로직/구조 무변경):

| 기존 클래스 | 교체 |
|---|---|
| `bg-primary-soft` | `bg-[#FFF0EA]` |
| `text-primary` | `text-[#E5402E]` |
| `border-primary-disabled` | `border-[#FF9D7E]` |
| `border-primary` | `border-[#FF4D3D]` |
| `bg-primary` | `bg-electric` |
| `bg-mint` | `bg-[#E8F8EE]` |
| `text-mint-ink` | `text-[#147A55]` |
| `border-hairline-soft` / `border-hairline` | `border-line` |
| `bg-surface-soft` | `bg-[#F7F4EE]` |
| `text-body` | `text-ink` |
| `bg-canvas` / `bg-canvas-warm` | `bg-paper` |
| `shadow-btn-primary` | `shadow-glow` |
| 위 표에 없는 legacy 토큰 발견 시 | 같은 계열의 새 토큰/hex로 치환 후 보고 |

- [ ] **Step 4: `tailwind.config.ts`에서 legacy 블록 제거** — `colors`에서 `// ── legacy: ...` 주석부터 `"amber-ink": "#9a6700",`까지 전부 삭제하고, `boxShadow`에서 `"btn-primary": ...` 줄을 삭제한다. 새 토큰(paper~lilac)과 fontSize(hero/score — score는 미사용이지만 무해)는 유지.

- [ ] **Step 5: 최종 잔존 클래스 검증** — 아래 grep이 app/, components/ 안에서 0건이어야 한다:

```bash
grep -rnE 'primary-soft|primary-disabled|primary-active|bg-primary|text-primary|border-primary|hairline|surface-soft|canvas-warm|bg-canvas|text-body|bg-mint|text-mint|lavender|bg-sky|text-sky|bg-amber|text-amber|btn-primary' app components
```
나오면 해당 위치를 Step 3 매핑표로 치환 후 재실행.

- [ ] **Step 6: 검증 + 커밋**

Run: `npx tsc --noEmit` && `npm run build` && `npm test` → 통과

```bash
git add -A
git commit -m "chore: remove legacy Button/cards and retire legacy design tokens"
```

---

### Task 12: 최종 검증 + 룩 컨펌 + Codex 감사 게이트

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 회귀** — `npm test`(5 suites) + `npm run build`(전 라우트) 통과 확인.

- [ ] **Step 2: dev 서버 전체 플로우 시각 점검** — `npm run dev` 후 사용자와 함께:
  웰컴 → 테스트(성별/퀴즈/결과) → 팀 생성 → 내 팀(마이 탭) → 홈 → 매칭 결과(링 드로잉) → 일정 → 확정(다크 D-n 샤인) → Q&A(다크) → 채팅.
  쇼케이스 HTML(`docs/superpowers/specs/...showcase.html`)과 나란히 대조. 탭바 4개 탭 이동 확인.

- [ ] **Step 3: prefers-reduced-motion 확인** — 전 화면 애니메이션 꺼지고 콘텐츠 전부 보임.

- [ ] **Step 4: 사용자 룩 컨펌 (게이트)** — 수정 요청 반영 후 재확인.

- [ ] **Step 5: Codex 감사 (CLAUDE.md 헌법)** — `/codex:review`로 Plan 1+2 전체 diff 감사. Critical/Major를 수정하고 Critical 0이 될 때까지 반복. 이후 finishing(PR 생성 — main 직접 push 금지)으로 진행.
