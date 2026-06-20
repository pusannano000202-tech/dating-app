# 부팅 디자인 시스템 핸드오프 — 충현 전달용

> **이 문서를 받는 사람(충현)의 Codex에게:**
> 아래는 성준이 구현한 부팅(부산대 과팅앱)의 **디자인 시스템 전체 + 화면별 동선**이다.
> 이 문서 하나만으로 동일한 룩 앤 필과 화면 흐름을 재생성할 수 있도록 작성됐다.
> **작업 지침:**
> 1. 2~3장(원칙·토큰), 4장(프리미티브), **9~11장(전체 페이지·도메인 컴포넌트·타입 코드)**은 **값/코드 그대로** 적용한다. 임의 개선·치환 금지. 색·픽셀 디테일은 이 코드가 단일 기준이다.
> 2. 5장(내비게이션 맵)과 6장(화면별 명세)은 동선·의도를 빠르게 파악하기 위한 개요다. 실제 구현 코드는 9장에 전부 들어 있다.
> 3. 12장의 로직·데이터 모듈(상태·Supabase·매칭 알고리즘 등)은 **디자인 무관**이다. 시그니처만 참조해 페이지 코드가 컴파일되게 채우거나 성준 원본을 그대로 가져온다.
> 4. 애니메이션은 전부 CSS keyframes + Tailwind로 처리한다. 모션 라이브러리 추가 금지.

**제품 한 줄 정의:** 친구와 팀을 만들어 보증금을 걸면 상대팀·시간·장소가 자동 확정되는 **프로필 비공개 자동확정 과팅 앱**.

**기술 스택:** Next.js 14 (App Router) · Tailwind CSS 3 · 순수 CSS 애니메이션 · Pretendard Variable 폰트. (TypeScript)

---

## 1. 디자인 원칙 5가지

이 5개가 모든 시각 결정의 상위 규칙이다.

1. **Warm Paper** — 순백 금지. 캔버스는 따뜻한 종이색(`#FAF7F2`), 흰색은 카드에만 쓴다.
2. **타이포 주도** — 큰 활자가 곧 그래픽. 장식 이모지 제거, 장식은 볼트(✦/⚡) 한 줄기만.
3. **전기 한 줄기** — 그라디언트(`electric`)는 핵심 액션에만: 매칭 CTA, 내 채팅 말풍선, 케미 링.
4. **비공개의 미학** — 상대팀 아바타는 프로스트(반투명 `?`) 처리로 "궁금함"을 디자인한다.
5. **감정 곡선 무드** — 탐색 단계는 밝은 페이퍼, **매칭 확정 이후 화면은 다크 무드**로 전환.

---

## 2. 디자인 토큰 — `tailwind.config.ts`

`tailwind.config.ts`의 `theme.extend`에 아래를 그대로 넣는다.

```ts
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
        // ── Warm Paper × Electric ──
        paper: "#FAF7F2",      // 캔버스(밝은 페이퍼)
        backdrop: "#131110",   // 데스크톱 프레임 바깥 배경
        ink: "#1B1916",        // 본문/잉크 버튼
        muted: "#8E887E",      // 보조 텍스트
        line: "rgba(27,25,22,0.08)", // 카드 보더/구분선
        "electric-from": "#FF3D5A",
        "electric-to": "#FF7A3D",
        lilac: "#C9B8FF",      // 오로라 블롭 전용
      },
      backgroundImage: {
        electric: "linear-gradient(120deg,#FF3D5A,#FF7A3D)", // 핵심 CTA/케미
        dusk: "radial-gradient(140% 90% at 80% -10%, #2B2017 0%, #191512 52%)", // 다크 무드 배경
        "shine-text": "linear-gradient(110deg,#FF3D5A 25%,#FFC2A1 50%,#FF7A3D 75%)",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "14px",
        lg: "20px",
        card: "24px",  // 카드
        btn: "18px",   // 버튼
        full: "9999px",
      },
      boxShadow: {
        card: "0 14px 30px rgba(27,25,22,0.07)",   // 중립 앰비언트
        glow: "0 14px 30px rgba(255,77,61,0.32)",  // 일렉트릭 CTA 전용
        ink: "0 14px 28px rgba(27,25,22,0.22)",    // 잉크 버튼/다크 카드
        pressed: "0 6px 12px rgba(27,25,22,0.18)", // 눌림 상태
        frame: "0 0 0 10px #2A2520, 0 0 0 11px #45403A, 0 44px 90px rgba(0,0,0,0.65)", // 폰 프레임
      },
      fontSize: {
        hero: ["32px", { lineHeight: "1.18", fontWeight: "700" }],
        score: ["48px", { lineHeight: "1.0", fontWeight: "800" }],
      },
      // 키프레임 본체는 globals.css에 있다 (.stagger 등 CSS 셀렉터와 공유)
      animation: {
        rise: "rise 0.9s cubic-bezier(0.22,1,0.36,1) both",
        drift: "drift 10s ease-in-out infinite alternate",
        "bolt-in": "bolt-in 0.7s cubic-bezier(0.34,1.56,0.64,1) both",
        "glow-breathe": "glow-breathe 3.2s ease-in-out infinite",
        fill: "fill-bar 1.4s cubic-bezier(0.22,1,0.36,1) both",
        shine: "shine 4s linear infinite",
        typing: "typing 1.2s ease-in-out infinite",
        floaty: "floaty 3.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
```

## 3. 디자인 토큰 — `app/globals.css`

폰트 import + 키프레임 + 스태거/펄스/접근성 규칙. 그대로 넣는다.

```css
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: "Pretendard Variable", Inter, system-ui, sans-serif;
}

* {
  -webkit-font-smoothing: antialiased;
}

body {
  background-color: #131110;
  color: #1b1916;
}

/* ── 모션 키프레임 ── */
@keyframes rise {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes drift {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(18px, -22px) scale(1.14); }
}
@keyframes bolt-in {
  0% { opacity: 0; transform: scale(0.3) rotate(-14deg); }
  65% { transform: scale(1.18) rotate(4deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes glow-breathe {
  0%, 100% { box-shadow: 0 18px 36px rgba(27, 25, 22, 0.24); }
  50% { box-shadow: 0 18px 44px rgba(255, 77, 61, 0.28); }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes halo {
  0% { box-shadow: 0 0 0 0 rgba(255, 122, 61, 0.5); }
  70%, 100% { box-shadow: 0 0 0 12px rgba(255, 122, 61, 0); }
}
@keyframes fill-bar {
  from { width: 0; }
}
@keyframes shine {
  0% { background-position: 200% center; }
  100% { background-position: -200% center; }
}
@keyframes typing {
  0%, 60%, 100% { transform: none; opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
@keyframes chip-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
@keyframes floaty {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes ring-draw {
  from { stroke-dashoffset: 414.69; }
}

/* 스태거 엔트런스: .stagger 직계 자식이 0.12s 간격으로 순차 등장 */
.stagger > *:not(.animate-drift) {
  animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.stagger > *:not(.animate-drift):nth-child(1) { animation-delay: 0.05s; }
.stagger > *:not(.animate-drift):nth-child(2) { animation-delay: 0.17s; }
.stagger > *:not(.animate-drift):nth-child(3) { animation-delay: 0.29s; }
.stagger > *:not(.animate-drift):nth-child(4) { animation-delay: 0.41s; }
.stagger > *:not(.animate-drift):nth-child(5) { animation-delay: 0.53s; }
.stagger > *:not(.animate-drift):nth-child(6) { animation-delay: 0.65s; }
.stagger > *:not(.animate-drift):nth-child(7) { animation-delay: 0.77s; }
.stagger > *:not(.animate-drift):nth-child(8) { animation-delay: 0.89s; }
.stagger > *:not(.animate-drift):nth-child(n + 9) { animation-delay: 1.01s; }

/* 매칭 탐색 펄스 닷 — 점멸 + 퍼지는 헤일로 */
.dot-live {
  animation:
    pulse-dot 1.6s ease-in-out infinite,
    halo 1.6s ease-out infinite;
}

/* 칩 선택 팝 */
.chip-pop {
  animation: chip-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 접근성: 모션 최소화 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## 4. 공용 프리미티브 (`components/ui/`)

아래 11개 컴포넌트는 **결정적 기반**이므로 코드를 그대로 생성한다. 모든 페이지는 이것들을 소비한다.

### 4.1 `PageShell.tsx` — 페이지 래퍼

paper/dark 무드 + 스태거 엔트런스 + 프레임 내 높이 + 탭바 여백을 자동 처리.

```tsx
import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  mood?: "paper" | "dark";
  stagger?: boolean;
  withTabBar?: boolean;
};

export function PageShell({
  mood = "paper",
  stagger = true,
  withTabBar = false,
  className = "",
  children,
  ...props
}: Props) {
  const moodCls =
    mood === "dark" ? "bg-dusk text-[#F2EEE7]" : "bg-paper text-ink";
  return (
    <main
      className={`relative flex min-h-full flex-col overflow-hidden px-6 pt-5 ${
        withTabBar ? "pb-28" : "pb-10"
      } ${moodCls} ${stagger ? "stagger" : ""} ${className}`}
      {...props}
    >
      {children}
    </main>
  );
}
```

### 4.2 `Button.tsx` — 버튼 (+ `buttonClassName` 공유 헬퍼)

variant: `ink`(검정 기본) / `electric`(그라디언트+글로우) / `ghost`(투명) / `glass`(다크 무드용). 56px 높이, 터치 피드백(active scale 0.965) 내장.

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

### 4.3 `ButtonLink.tsx` — 링크형 버튼

`<Link>` + 버튼 스타일. **`<Link><Button>` 중첩(잘못된 HTML) 대신 항상 이걸 쓴다.**

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

### 4.4 `Card.tsx` — 카드

24px 라운드. variant: `light`(흰 카드) / `dark`(잉크 그라디언트) / `glass`(다크 무드용). `pressable` 시 키보드 접근성 포함 버튼화.

```tsx
import { HTMLAttributes, KeyboardEvent } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: "light" | "dark" | "glass";
  pressable?: boolean;
};

export function Card({
  variant = "light",
  pressable = false,
  className = "",
  children,
  ...props
}: Props) {
  const variants = {
    light: "border border-line bg-white shadow-card",
    dark: "bg-gradient-to-br from-[#26211C] to-[#1B1916] text-[#F2EEE7] shadow-ink",
    glass:
      "border border-[#F2EEE7]/10 bg-[#F2EEE7]/[0.06] text-[#F2EEE7] backdrop-blur-md",
  };
  const press = pressable
    ? "cursor-pointer transition-[transform,box-shadow] duration-150 active:scale-[0.97] active:shadow-pressed"
    : "";
  const interactive = pressable
    ? {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.currentTarget.click();
          }
        },
      }
    : {};
  return (
    <div
      className={`rounded-card p-5 ${variants[variant]} ${press} ${className}`}
      {...interactive}
      {...props}
    >
      {children}
    </div>
  );
}
```

### 4.5 `Chip.tsx` — 칩

pill 모양. 선택 시 일렉트릭 하이라이트 + 팝 애니메이션.

```tsx
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export function Chip({
  selected = false,
  className = "",
  children,
  ...props
}: Props) {
  const look = selected
    ? "chip-pop border-[#FF9D7E] bg-[#FFF0EA] text-[#E5402E]"
    : "border-line bg-white text-[#6E675C]";
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`rounded-full border-[1.5px] px-4 py-2 text-xs font-bold transition-colors duration-150 active:scale-95 ${look} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

### 4.6 `Avatar.tsx` — 아바타

그라디언트 이니셜 아바타 + `frost` variant(반투명 `?` — **비공개 표현의 핵심**).

```tsx
const PALETTES = [
  "from-[#FF3D5A] to-[#FF7A3D]",
  "from-[#7B6CFF] to-[#C9B8FF]",
  "from-[#2EB8A5] to-[#8CE8B4]",
];

type Props = {
  label?: string;
  frost?: boolean;
  paletteIndex?: number;
  className?: string;
};

export function Avatar({
  label = "?",
  frost = false,
  paletteIndex = 0,
  className = "",
}: Props) {
  if (frost) {
    return (
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-white bg-gradient-to-br from-[#EFE9E0] to-[#E2D9CC] text-sm font-extrabold text-[#B4AB9D] blur-[0.4px] ${className}`}
      >
        ?
      </span>
    );
  }
  const palette = PALETTES[paletteIndex % PALETTES.length];
  return (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${palette} text-sm font-extrabold text-white ${className}`}
    >
      {label}
    </span>
  );
}
```

### 4.7 `ChemiRing.tsx` — 케미 링

케미 % 그라디언트 링. SVG stroke 드로잉(1.6초) + 플로팅. `CIRCUMFERENCE`(414.69)는 globals.css의 `ring-draw` from 값과 반드시 일치.

```tsx
import { useId } from "react";

const CIRCUMFERENCE = 414.69; // 2π × r(66) — globals.css ring-draw from 값과 일치

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

### 4.8 `AuroraBlob.tsx` — 오로라 블롭

블러 드리프트 블롭. 웰컴/결과/다크 배경 장식. 부모에 `relative + overflow-hidden` 필요. 크기·위치·색은 className으로 지정(예: `h-72 w-72 bg-lilac/40 -top-10 -left-10`).

```tsx
type Props = { className?: string };

/** 블러 처리된 드리프트 블롭 — 부모에 relative + overflow-hidden 필요 */
export function AuroraBlob({ className = "" }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute animate-drift rounded-full blur-[58px] ${className}`}
    />
  );
}
```

### 4.9 `TabBar.tsx` — 하단 글래스 탭바

홈/매칭/채팅/마이 4탭. blur + 반투명. **대시보드 계열 페이지에만** 노출(웰컴/테스트 진행 중엔 숨김). 노출 페이지는 `PageShell`에 `withTabBar` 줘서 하단 여백 확보.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "홈" },
  { href: "/match/result", label: "매칭" },
  { href: "/match/chat", label: "채팅" },
  { href: "/team/demo", label: "마이" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-paper/80 px-2 pb-6 pt-3 backdrop-blur-xl">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== "/home" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
              active ? "text-[#FF4D3D]" : "text-[#B5AFA4]"
            }`}
          >
            <TabIcon name={tab.label} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabIcon({ name }: { name: (typeof TABS)[number]["label"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "홈":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "매칭":
      return (
        <svg {...common}>
          <path d="M13 2L4.5 13.5h5.5L9 22l8.5-11.5H12L13 2z" />
        </svg>
      );
    case "채팅":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
        </svg>
      );
  }
}
```

### 4.10 `BoltLogo.tsx` — 볼트 로고

볼트 SVG. variant: `ink` / `electric`(그라디언트) / `white`. `size` prop. 브랜드 액센트.

```tsx
import { useId } from "react";

type Props = {
  size?: number;
  variant?: "ink" | "electric" | "white";
  className?: string;
};

export function BoltLogo({ size = 24, variant = "ink", className = "" }: Props) {
  const gradientId = useId();
  const fill =
    variant === "electric"
      ? `url(#${gradientId})`
      : variant === "white"
        ? "#FFFFFF"
        : "#1B1916";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      {variant === "electric" && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF3D5A" />
            <stop offset="1" stopColor="#FF7A3D" />
          </linearGradient>
        </defs>
      )}
      <path d="M13 2L4.5 13.5h5.5L9 22l8.5-11.5H12L13 2z" fill={fill} />
    </svg>
  );
}
```

### 4.11 `LockIcon.tsx` — 잠금 아이콘

비공개 안내 옆에 붙이는 작은 자물쇠(11px).

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

---

## 5. 정보 구조 & 내비게이션 맵 (동선)

### 5.1 라우트 목록 & 무드

| 라우트 | 화면 | 무드 | 탭바 | 비고 |
|--------|------|------|------|------|
| `/` | 웰컴(브랜드 모먼트) | paper | ✕ | 비로그인/첫 진입 |
| `/test` | 성향 테스트 | paper | ✕ | 진행 중엔 탭바 숨김 |
| `/team/create` | 팀 생성 | paper | ✕ | |
| `/team/demo` | 팀 프로필 = **마이 탭** | paper | ◯ | |
| `/home` | 대시보드 = **홈 탭** | paper | ◯ | 테스트/팀 생성 후 랜딩 |
| `/match` | (리다이렉트) | — | — | → `/match/result` |
| `/match/result` | 매칭 결과 = **매칭 탭** | paper | ◯ | 케미 링 |
| `/match/schedule` | 일정 선택 | paper | ✕ | |
| `/match/confirmed` | 매칭 확정 | **dark** | ✕ | 감정 곡선 전환점 |
| `/match/qa` | 오늘의 Q&A | **dark** | ✕ | |
| `/match/chat` | 채팅 = **채팅 탭** | paper | ◯ | 내 말풍선만 일렉트릭 |

### 5.2 전이(동선) 그래프

```
  /  (웰컴)
   ├─ [시작하기] ───────────────→ /test
   └─ [초대 코드로 합류] ─────────→ /team/create

/test (성향 테스트)
   └─ [완료] ───────────────────→ /team/create

/team/create (팀 생성)
   ├─ [팀 만들기 제출] ───────────→ /team/demo
   └─ [테스트 먼저] ─────────────→ /test

/team/demo (마이 / 팀 프로필)
   ├─ [매칭 시작] ───────────────→ /match  → (redirect) → /match/result
   └─ [팀 다시 만들기] ──────────→ /team/create

/home (대시보드)
   └─ [오늘의 추천 카드] ────────→ /match/result

/match/result (케미 결과)
   ├─ [일정 잡기 / electric CTA] ─→ /match/schedule
   └─ [매칭 없음 시] ────────────→ /team/create

/match/schedule (일정)
   └─ [확정] ───────────────────→ /match/confirmed

/match/confirmed (확정 · 다크)
   ├─ [일정 보기] ───────────────→ /match/schedule
   └─ [오늘의 질문 / electric] ──→ /match/qa

/match/chat (채팅)
   └─ [헤더 닫기/홈] ────────────→ /home

하단 탭바(대시보드 계열): 홈 /home · 매칭 /match/result · 채팅 /match/chat · 마이 /team/demo
```

---

## 6. 화면별 명세 (레이아웃 · 디자인 · 모션)

각 화면은 4장 프리미티브로 조립한다. 모든 화면 공통: `PageShell` 스태거 엔트런스, 터치 피드백, `prefers-reduced-motion` 시 모션 전부 비활성.

### 6.1 웰컴 `/` (paper, 탭바 ✕)
- **목적:** 첫 진입 브랜드 모먼트. 별도 스플래시 없이 이 화면이 흡수.
- **레이아웃:** 페이퍼 배경 + `AuroraBlob`(lilac/일렉트릭 톤) 1~2개. 상단 `BoltLogo`(electric) 액센트. 중앙 디스플레이 카피 **"연애세포, 다시 부팅할 시간."**(900 웨이트, 타이트 트래킹). 하단에 `ButtonLink`(ink) "시작하기" → `/test`, 그 아래 ghost 링크 "초대 코드로 합류" → `/team/create`.
- **모션:** 블롭 `animate-drift`(무한). 카피·CTA 스태거 페이드업. 볼트 `animate-bolt-in`. CTA에 `animate-glow-breathe`.

### 6.2 홈 대시보드 `/home` (paper, 탭바 ◯)
- **목적:** 테스트/팀 생성 완료 후 랜딩하는 허브.
- **레이아웃:** ① **내 팀 카드**(`Card variant="dark"`) — 멤버 `Avatar` 나열, 분석 진행바(`animate-fill`), "매칭 탐색 중" 라이브 닷(`.dot-live`). ② **오늘의 추천 카드**(`Card light`, `pressable`) — 상대팀 `Avatar frost`(프로스트), 무드 칩, 케미 % 미리보기, `LockIcon` + 비공개 안내. 카드 클릭 → `/match/result`. 하단 `TabBar`.
- **모션:** 카드 스태거 등장, 진행바 차오름, 펄스 닷.

### 6.3 성향 테스트 `/test` (paper, 탭바 ✕)
- **목적:** 진입 성향 검사(여러 문항).
- **레이아웃:** 상단 **세그먼트 진행바**(12분할). 큰 질문 활자(hero급). 선택지는 카드형 — 선택 시 그라디언트 보더 하이라이트. 마지막 문항 후 → `/team/create`.
- **모션:** 질문 전환마다 스태거 재생, 선택 시 팝(scale).

### 6.4 팀 생성 `/team/create` (paper, 탭바 ✕)
- **목적:** 팀 이름/멤버/조건 입력.
- **레이아웃:** 폼 + `Chip`(조건 선택) 새 토큰 통일. 제출 → `/team/demo`. 보조로 "테스트 먼저" → `/test`.
- **모션:** 스태거 + 칩 선택 팝(`chip-pop`).

### 6.5 팀 프로필 / 마이 `/team/demo` (paper, 탭바 ◯)
- **목적:** 내 팀 프로필 확인(마이 탭).
- **레이아웃:** `TeamProfileCard` 리스타일(프리미티브 위에서). 멤버 아바타·소개. 액션: "매칭 시작" → `/match`(→result), "팀 다시 만들기" → `/team/create`. 하단 `TabBar`.
- **모션:** 스태거.

### 6.6 매칭 결과 `/match/result` (paper, 탭바 ◯)
- **목적:** 상대팀과의 케미 결과(매칭 탭).
- **레이아웃:** 중앙 `ChemiRing`(예: 92). 그 아래 "케미 근거" 3줄(순차 등장). 상대팀은 여전히 `Avatar frost`(확정 전 비공개 유지). 하단 일렉트릭 CTA "일정 잡기" → `/match/schedule`. 매칭 없을 때 → `/team/create`. 하단 `TabBar`.
- **모션:** 링 1.6초 드로잉(`ring-draw`) + 플로팅(`floaty`), 근거 순차 등장.

### 6.7 일정 선택 `/match/schedule` (paper, 탭바 ✕)
- **목적:** 가능한 날짜/시간 확정.
- **레이아웃:** 라이트 토큰 적용된 날짜·시간 선택 UI. 확정 → `/match/confirmed`.
- **모션:** 스태거.

### 6.8 매칭 확정 `/match/confirmed` (**dark**, 탭바 ✕) ← 감정 곡선 전환점
- **목적:** 매칭 성사 — 무드가 다크로 바뀌는 클라이맥스.
- **레이아웃:** `PageShell mood="dark"`(dusk 배경). 거대 **D-n** 그라디언트 숫자(shine 스윕). `Card variant="glass"` 정보 카드(시간·장소). 액션: "일정 보기"(ink/glass) → `/match/schedule`, "오늘의 질문"(electric) → `/match/qa`.
- **모션:** D-n 광택 스윕(`shine`, 무한), 글래스 카드 순차 등장.

### 6.9 오늘의 Q&A `/match/qa` (**dark**, 탭바 ✕)
- **목적:** 확정 후 상대팀과 아이스브레이킹 질문.
- **레이아웃:** 다크 무드. "오늘의 질문" 카드(`glass`, 일렉트릭 보더). 답변 입력.
- **모션:** 스태거 + 카드 등장.

### 6.10 채팅 `/match/chat` (paper, 탭바 ◯)
- **목적:** 매칭된 팀과 대화.
- **레이아웃:** 페이퍼 톤. **내 말풍선만 일렉트릭** 그라디언트, 상대는 흰 카드 톤. 글래스 헤더(blur) + 글래스 입력바. 헤더에 D-n 필(pill). 헤더 닫기 → `/home`.
- **모션:** 말풍선 순차 등장, 타이핑 인디케이터 도트(`typing`).
- **주의(이월 버그):** 컨테이너 높이는 `h-full` 사용. `h-[calc(100vh-44px)]` 류는 모바일 키보드에서 깨지므로 금지.

---

## 7. 모바일 · 데스크톱 폰 프레임 (`app/layout.tsx`)

- 모바일(<480px): 풀스크린. 데스크톱: 중앙 **420px 폰 프레임**(라운드 40px + `shadow-frame`), 스크롤은 프레임 내부 한정.
- `min-h-screen` 의존 금지 — 높이는 `PageShell`이 `min-h-full`로 흡수.

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부팅 — 부산대 과팅",
  description: "연애세포, 다시 부팅할 시간. 부산대생 전용 팀 과팅 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-[100dvh] bg-backdrop font-sans text-ink sm:flex sm:items-center sm:justify-center sm:py-6">
        <div className="relative h-[100dvh] w-full bg-paper sm:h-[min(860px,calc(100dvh-48px))] sm:max-w-[420px] sm:overflow-hidden sm:rounded-[40px] sm:shadow-frame">
          <div className="h-full overflow-y-auto">{children}</div>
        </div>
      </body>
    </html>
  );
}
```

---

## 8. 모션 레퍼런스 (요약)

| 이름 | 용도 |
|------|------|
| `stagger`(.stagger) | 페이지 진입 시 직계 자식 0.12s 간격 순차 등장 — 모든 화면 기본 |
| `rise` | 단일 요소 페이드+상승(스태거의 본체) |
| `drift`(animate-drift) | 오로라 블롭 드리프트(무한) |
| `bolt-in` | 볼트 로고 탄성 등장 |
| `glow-breathe` | 주요 CTA 글로우 호흡 |
| `fill-bar`(animate-fill) | 진행바 차오름 |
| `shine` | 다크 D-n 숫자 광택 스윕 |
| `typing` | 채팅 타이핑 인디케이터 도트 |
| `floaty` | 케미 링 부유 |
| `ring-draw` | 케미 링 stroke 드로잉(1.6초) |
| `.dot-live` | 매칭 탐색 펄스 닷(pulse-dot + halo) |
| `.chip-pop` | 칩 선택 팝 |

**접근성:** `prefers-reduced-motion: reduce`일 때 모든 animation/transition 비활성(globals.css에 포함). 반드시 유지.

---

## 9. 전체 페이지 코드 (색·픽셀 단일 기준)

아래는 모든 user-facing 페이지의 실제 `page.tsx` 전체다. 6장의 명세와 이 코드가 다를 경우 **이 코드가 우선**한다. 페이지마다 토큰에 없는 **페이지 레벨 색**이 직접 박혀 있으니 그대로 옮긴다.

**자주 쓰는 확장 팔레트(토큰 외) 치트시트:**

| 색 | 용도 |
|----|------|
| `#FF6A4E` | ✦ eyebrow 라벨(START/TEAM/SCHEDULE/QUESTION) |
| `#E5402E` | 강조 빨강 — 별표(*), 숫자, 선택 텍스트 |
| `#FF4D3D` | 선택 카드 보더 / 탭 활성색 / 어드민 바 |
| `#FF9D7E` | 인풋 포커스 보더, 칩/필 보더 |
| `#FFF0EA` · `#FFF6F1` | 선택된 칩·필 배경(라이트) |
| `#F7F4EE` · `#F6F2EB` · `#F1EDE6` | 따뜻한 보조 서피스 |
| `#6E675C` | 보조 텍스트(칩 안 등) |
| `#D8D2C7` | 점선 보더(초대 대기 카드) |
| **다크무드** `#FFB9A3` | 다크 화면 코랄 강조 텍스트 |
| **다크무드** `#EDE9E2` · `#F2EEE7` | 다크 화면 본문/제목 텍스트 |
| **다크무드** `#2B2722` · `#1F1B17` | 다크 보더/아바타 링 |

### 9.1 `app/page.tsx` — 웰컴 `/`

```tsx
import Link from "next/link";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { BoltLogo } from "@/components/ui/BoltLogo";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageShell } from "@/components/ui/PageShell";

export default function WelcomePage() {
  return (
    <PageShell stagger={false} className="px-7">
      <AuroraBlob className="-right-28 -top-24 h-80 w-80 bg-[#FF3D5A]/15" />
      <AuroraBlob className="-left-32 top-72 h-72 w-72 bg-[#C9B8FF]/20 [animation-delay:-4s]" />
      <AuroraBlob className="-bottom-20 -right-16 h-60 w-60 bg-[#FF7A3D]/10 [animation-delay:-7s]" />

      <div className="mt-6 flex animate-rise items-center gap-2.5 [animation-delay:0.15s]">
        <span className="animate-bolt-in [animation-delay:0.25s]">
          <BoltLogo size={24} />
        </span>
        <span className="text-[21px] font-black tracking-[-0.6px]">부팅</span>
      </div>

      <div className="my-auto">
        <h1 className="text-[38px] font-black leading-[1.22] tracking-[-1.8px]">
          <span className="block animate-rise [animation-delay:0.5s]">연애세포,</span>
          <span className="block animate-rise [animation-delay:0.68s]">
            다시{" "}
            <em className="bg-electric bg-clip-text not-italic text-transparent">
              부팅
            </em>
            할
          </span>
          <span className="block animate-rise [animation-delay:0.86s]">시간.</span>
        </h1>
        <p className="mt-4 animate-rise text-[15px] font-medium leading-[1.75] text-muted [animation-delay:1.1s]">
          부산대생 팀 과팅 · 프로필 비공개
          <br />
          매칭부터 시간·장소까지 자동 확정
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-4">
        <div className="animate-rise [animation-delay:1.35s]">
          <ButtonLink href="/test" variant="ink" fullWidth className="animate-glow-breathe">
            시작하기 <BoltLogo size={16} variant="electric" />
          </ButtonLink>
        </div>
        <Link
          href="/team/create"
          className="animate-rise text-center text-sm font-semibold text-muted [animation-delay:1.55s]"
        >
          팀 초대를 받으셨나요?{" "}
          <b className="font-extrabold text-[#E5402E]">코드로 합류 →</b>
        </Link>
      </div>
    </PageShell>
  );
}
```

### 9.2 `app/home/page.tsx` — 대시보드 `/home`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { LockIcon } from "@/components/ui/LockIcon";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
import { loadTeam } from "@/lib/storage";

const FALLBACK = { teamName: "공대 F4", initials: ["성", "현", "준"] };

export default function HomeDashboardPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState(FALLBACK.teamName);
  const [initials, setInitials] = useState<string[]>(FALLBACK.initials);

  useEffect(() => {
    const team = loadTeam();
    if (team?.teamName) setTeamName(team.teamName);
    if (team?.members?.length) {
      const next = team.members
        .map((m) => m.nickname.trim().slice(0, 1))
        .filter(Boolean);
      if (next.length) setInitials(next);
    }
  }, []);

  return (
    <>
      <PageShell withTabBar>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-muted">좋은 저녁이에요</p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.8px]">
              오늘의 매칭
            </h1>
          </div>
          <Avatar label={initials[0] || "부"} />
        </div>

        <Card variant="dark" className="relative mt-5 overflow-hidden">
          <AuroraBlob className="-right-12 -top-14 h-36 w-36 bg-[#FF7A3D]/15 blur-[42px]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-base font-extrabold tracking-[-0.4px]">
                {teamName}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-[#FF7A3D]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#FFB9A3]">
                <span className="dot-live h-1.5 w-1.5 rounded-full bg-[#FF7A3D]" />
                매칭 탐색 중
              </span>
            </div>
            <div className="mt-4 flex">
              {initials.map((ch, i) => (
                <Avatar
                  key={`${ch}-${i}`}
                  label={ch}
                  paletteIndex={i}
                  className="-mr-2 h-9 w-9 border-[2.5px] border-[#1F1B17] text-xs"
                />
              ))}
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-[#F2EEE7]/30 text-xs font-semibold text-[#F2EEE7]/50">
                +
              </span>
            </div>
            <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#F2EEE7]/10">
              <div className="h-full w-3/4 animate-fill rounded-full bg-electric" />
            </div>
            <p className="mt-2 text-[11px] font-semibold text-[#F2EEE7]/55">
              팀 성향 분석 3/4 완료 — 한 명만 더!
            </p>
          </div>
        </Card>

        <Card
          className="mt-4"
          pressable
          onClick={() => router.push("/match/result")}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold tracking-[2.5px] text-muted">
              추천 상대팀
            </span>
            <span className="bg-electric bg-clip-text text-sm font-black text-transparent">
              케미 92%
            </span>
          </div>
          <h2 className="mt-2 text-lg font-extrabold tracking-[-0.4px]">
            간호 트리오
          </h2>
          <div className="mt-3 flex">
            <Avatar frost className="-mr-2" />
            <Avatar frost className="-mr-2" />
            <Avatar frost />
          </div>
          <div className="mt-3.5 flex gap-1.5">
            {["# 차분한", "# 카페파", "# 수요일"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-line bg-[#F7F4EE] px-3 py-1.5 text-[11px] font-semibold text-[#6E675C]"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-3.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <LockIcon />
            프로필은 매칭 확정 후에 공개돼요
          </p>
        </Card>
      </PageShell>
      <TabBar />
    </>
  );
}
```

### 9.3 `app/test/page.tsx` — 성향 테스트 `/test`

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

### 9.4 `app/team/create/page.tsx` — 팀 생성 `/team/create`

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

### 9.5 `app/team/demo/page.tsx` — 팀 프로필 / 마이 `/team/demo`

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

### 9.6 `app/match/page.tsx` — 리다이렉트 `/match`

```tsx
import { redirect } from "next/navigation";

export default function MatchPage() {
  redirect("/match/result");
}
```

### 9.7 `app/match/result/page.tsx` — 매칭 결과 `/match/result`

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

### 9.8 `app/match/schedule/page.tsx` — 일정 선택 `/match/schedule`

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

### 9.9 `app/match/confirmed/page.tsx` — 매칭 확정 `/match/confirmed` (다크)

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

function formatHour(time: string): string {
  const h = parseInt(time, 10);
  if (h === 0) return "오전 12시";
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
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
        {flow.schedule.confirmedTime && ` · ${formatHour(flow.schedule.confirmedTime)}`}
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
              {formatHour(flow.schedule.confirmedTime)}
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

### 9.10 `app/match/qa/page.tsx` — 오늘의 Q&A `/match/qa` (다크)

```tsx
"use client";

import { useEffect, useState } from "react";
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

### 9.11 `app/match/chat/page.tsx` — 채팅 `/match/chat`

> Supabase `chat_messages` 테이블 Realtime 구독. 디자인 포인트: **내 말풍선만 electric**, 글래스 헤더/입력바, 컨테이너는 `h-full`(키보드 버그 방지).

```tsx
"use client";

import Link from "next/link";
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
      <div className="flex items-center gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur-xl">
        <Link
          href="/home"
          aria-label="홈으로"
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-transform active:scale-90"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
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

### 9.12 `app/admin/page.tsx` — 매칭 검수 대시보드 `/admin` (내부용, 동선 외)

> 사용자 동선에는 없는 **내부 검수 화면**. 매칭 엔진 점수 근거를 확인하는 용도. 라이트 톤 + 상태 라벨 색을 따로 쓴다.

```tsx
import { AppHeader } from "@/components/AppHeader";
import { getMatchOverview } from "@/lib/adminData";
import { MoodKey, MatchResult } from "@/types/matching";

const MOOD_LABELS: Record<MoodKey, string> = {
  comfortableTalk: "편한 대화형",
  activeSocial: "활발한 친목형",
  gamesAndDrinks: "게임/술자리형",
  respectfulSafe: "예의/안전 중시형",
  naturalIntro: "자연스러운 소개팅형",
};

const LABEL_STYLES: Record<MatchResult["label"], string> = {
  "Strong vibe fit": "bg-[#E8F8EE] text-[#147A55]",
  "Good with some differences": "bg-[#FFF3D8] text-[#9A6700]",
  "Different atmosphere preferences": "bg-[#F7F4EE] text-muted",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-muted w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#F7F4EE] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#FF4D3D] to-[#ff8a65] rounded-full"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-ink w-7 text-right">{value}</span>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const overview = await getMatchOverview();

  return (
    <>
      <AppHeader />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[720px] mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-xl font-black text-ink tracking-[-0.5px] mb-1">매칭 검수 대시보드</h1>
            <p className="text-xs text-muted leading-relaxed">
              자동 매칭 엔진이 각 팀에게 어떤 추천을 내놓는지, 점수 산정 근거와 함께 한눈에 확인해요.
              <br />
              (Supabase DB 연동 — 데이터가 없거나 연결에 실패하면 <code className="text-[11px] bg-[#F7F4EE] rounded px-1">lib/adminData.ts</code>가 자동으로 mock 데이터로 폴백해요)
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {overview.map(({ team, matches }) => (
              <section key={team.teamName} className="border border-line rounded-[16px] overflow-hidden">
                {/* 팀 헤더 */}
                <div className="bg-[#F7F4EE] px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-ink">{team.teamName}</p>
                    <p className="text-[10px] text-muted">
                      {MOOD_LABELS[team.mood]} · {team.size}인 · {team.ageRange}세
                      {team.maleCount !== undefined && (
                        <> · 남 {team.maleCount} / 여 {team.femaleCount ?? 0}</>
                      )}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-muted bg-white border border-line rounded-full px-2 py-1">
                    추천 {matches.length}팀
                  </span>
                </div>

                {/* 추천 랭킹 */}
                <div className="flex flex-col divide-y divide-line">
                  {matches.map((m, i) => (
                    <div key={m.team.teamName} className="px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-[#E5402E] w-5">#{i + 1}</span>
                          <span className="text-xs font-bold text-ink">{m.team.teamName}</span>
                          <span className="text-[9px] text-muted">{MOOD_LABELS[m.team.mood]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 ${LABEL_STYLES[m.label]}`}>
                            {m.label}
                          </span>
                          <span className="text-sm font-black text-ink">{m.score}점</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 max-w-[360px]">
                        <ScoreBar label="분위기" value={m.vibeScore} />
                        <ScoreBar label="역할" value={m.roleScore} />
                        <ScoreBar label="조건" value={m.conditionScore} />
                      </div>
                      <ul className="flex flex-wrap gap-1.5">
                        {m.reasons.map((r, j) => (
                          <li key={j} className="text-[9px] text-muted bg-[#F7F4EE] rounded-full px-2 py-1">
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
```

---

## 10. 도메인 컴포넌트 코드 (`components/`)

프리미티브 위에서 도메인 의미를 입힌 컴포넌트. 페이지가 직접 소비한다.

### 10.1 `components/AppHeader.tsx`

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

### 10.2 `components/MoodChip.tsx`

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

### 10.3 `components/MoodSelector.tsx`

```tsx
import { MoodKey } from "@/types/matching";
import { MoodChip } from "./MoodChip";

const ALL_MOODS: MoodKey[] = [
  "comfortableTalk",
  "activeSocial",
  "gamesAndDrinks",
  "respectfulSafe",
  "naturalIntro",
];

type Props = {
  value: MoodKey | null;
  onChange: (mood: MoodKey) => void;
};

export function MoodSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_MOODS.map((mood) => (
        <MoodChip
          key={mood}
          mood={mood}
          selected={value === mood}
          onClick={() => onChange(mood)}
        />
      ))}
    </div>
  );
}
```

### 10.4 `components/TeamProfileCard.tsx`

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

---

## 11. 타입 정의 (`types/`)

페이지·컴포넌트 코드가 의존하는 타입. 그대로 둔다.

### 11.1 `types/matching.ts`

```ts
export type TraitKey =
  | "atmosphereCoordination"
  | "consideration"
  | "participation"
  | "respectfulness"
  | "communicationBalance";

export type MoodKey =
  | "comfortableTalk"
  | "activeSocial"
  | "gamesAndDrinks"
  | "respectfulSafe"
  | "naturalIntro";

export type MemberRole =
  | "moodMaker"
  | "coordinator"
  | "considerate"
  | "reactor";

export type Gender = "male" | "female";

export type TeamMember = {
  nickname: string;
  role: MemberRole;
  traits?: Record<TraitKey, number>;
  isLeader?: boolean;
  gender?: Gender;
};

export type UserProfile = {
  nickname: string;
  traits: Record<TraitKey, number>;
  gender?: Gender;
};

export type TeamProfile = {
  teamName: string;
  school: "부산대학교";
  region: "부산";
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
  vibeScore: number;
  roleScore: number;
  conditionScore: number;
  reasons: string[];
  label: "Strong vibe fit" | "Good with some differences" | "Different atmosphere preferences";
};
```

### 11.2 `types/match-flow.ts`

```ts
import { MoodKey } from "./matching";

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

---

## 12. 의존 로직·데이터 모듈 (디자인 무관 — 시그니처만)

아래는 페이지가 import하는 **로직/데이터**다. 디자인과 무관하므로 이 문서엔 시그니처만 싣는다. 정확한 알고리즘이 필요하면 성준 레포(`gwating-app/lib/`, `gwating-app/data/`) 원본을 그대로 가져온다. Codex가 화면만 먼저 살릴 때는 아래 시그니처대로 mock/stub해도 된다.

| 모듈 | 주요 export | 역할 |
|------|------------|------|
| `lib/storage.ts` | `saveUser(p: UserProfile)` / `loadUser(): UserProfile \| null` · `saveTeam(t: TeamProfile)` / `loadTeam(): TeamProfile \| null` · `saveMatchFlow(s: MatchFlowState)` / `loadMatchFlow(): MatchFlowState \| null` | localStorage 기반 영속. 서버 없이 플로우 유지 |
| `lib/scoring.ts` | `classifyRole(traits: Record<TraitKey, number>): MemberRole` | 성향 점수 → 팀 내 역할 분류 |
| `lib/matching.ts` | `rankTeams(my: TeamProfile, candidates: TeamProfile[]): MatchResult[]` | 분위기·역할·조건 가중 점수로 상대팀 랭킹 |
| `lib/qa.ts` | `distributeQuestions(total: number, days: number): number[]` · `getTodayMemberIndex(day: number, memberCount: number): number` · `getChemistryComment(a: string, b: string): string` | Q&A 일자 분배 / 오늘 순번 팀원 / 답변 케미 코멘트 |
| `lib/schedule.ts` | `getEarliestIntersection(a: string[], b: string[]): string \| undefined` | 두 팀 가용 날짜·시간 교집합 중 최솟값 |
| `lib/supabase.ts` | `supabase` (client \| null) · `isSupabaseConfigured: boolean` | 채팅 Realtime용. env 미설정 시 채팅만 비활성, 나머지 화면 정상 |
| `lib/adminData.ts` | `getMatchOverview(): Promise<{ team: TeamProfile; matches: MatchResult[] }[]>` | 어드민 검수용. DB 실패 시 mock 폴백 |
| `data/questions.ts` | `questions: { situation: string; trait: TraitKey; choices: { text: string; score: number }[] }[]` | 성향 테스트 문항 |
| `data/questions-by-mood.ts` | `QUESTIONS_BY_MOOD: Record<MoodKey, QAQuestion[]>` · `type QAQuestion = { id: string; text: string; choices: string[] }` | 무드별 Q&A 문항 |
| `data/mockTeams.ts` | `mockTeams: TeamProfile[]` | 매칭 후보 더미 팀 |
| `data/moodWeights.ts` | 무드 간 호환 가중치 테이블 | `lib/matching.ts`가 소비 |

**환경변수:** 채팅만 Supabase 필요 — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, 그리고 `chat_messages` 테이블(`id, match_id, sender, body, created_at`) + Realtime 활성화. 미설정이어도 나머지 9개 화면은 localStorage만으로 완전 동작한다.

---

## 부록 A. 원본 위치 (성준 레포 기준)

- 디자인 스펙: `gwating-app/docs/superpowers/specs/2026-06-10-design-refresh-design.md`
- 시각 기준 시안(브라우저로 열기): 같은 폴더의 `*-showcase.html`, `*-motion-spec.html`
- 구현 플랜: `gwating-app/docs/superpowers/plans/2026-06-10-design-refresh-plan1-foundation.md`(파운데이션), `2026-06-11-design-refresh-plan2-migration.md`(전 화면 마이그레이션)
- 실제 코드: `gwating-app/components/ui/`, `gwating-app/app/`

> 이 문서는 위 자료를 충현 인수인계용으로 압축한 것이다. 픽셀 단위 시각 기준이 필요하면 showcase HTML을 직접 열어 대조한다.
