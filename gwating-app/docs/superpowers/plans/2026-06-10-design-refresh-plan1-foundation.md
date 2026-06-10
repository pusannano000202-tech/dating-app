# 디자인 리프레시 Plan 1 — 파운데이션 + 프리미티브 + 웰컴/홈 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warm Paper × Electric 디자인 시스템의 토큰·프리미티브를 구축하고, 웰컴(`/`)과 홈 대시보드(`/home`)를 새 디자인으로 구현한다.

**Architecture:** Tailwind 토큰 + globals.css 키프레임이 단일 모션/컬러 소스. `components/ui/`의 프리미티브 8종이 모든 페이지의 부품. 레이아웃 레벨에서 데스크톱 모바일 프레임을 씌우고, 페이지는 `PageShell` 위에 올린다. 로직(lib/, Supabase, 라우팅)은 변경하지 않는다.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS 3, 순수 CSS keyframes (라이브러리 추가 없음), Pretendard Variable.

**스펙:** `docs/superpowers/specs/2026-06-10-design-refresh-design.md`
**시각 기준:** 같은 폴더의 `...-showcase.html`(화면 조합), `...-motion-spec.html`(모션 타이밍), `...-welcome-live.html`(웰컴 — 사용자 승인 완료본)

**검증 방식에 대한 주석:** 이 플랜은 순수 스타일링 작업이라 신규 단위 테스트를 만들지 않는다. 회귀 감지선은 (1) 기존 jest 테스트 5종 — lib 로직 무변경 확인, (2) `npm run build` — 타입/컴파일 확인, (3) dev 서버에서 시각 기준 HTML과 눈 대조. 모든 명령은 `gwating-app/` 루트에서 실행한다.

**Plan 2 예고:** 기존 페이지 9개 마이그레이션(테스트/팀/매칭 플로우 + 다크 무드 + ChemiRing + 구 토큰 제거)은 Task 8의 사용자 룩 컨펌 후 별도 플랜으로 작성한다.

---

### Task 1: 디자인 토큰 — tailwind.config.ts + globals.css

**Files:**
- Modify: `tailwind.config.ts` (전체 교체)
- Modify: `app/globals.css` (전체 교체)

- [ ] **Step 1: tailwind.config.ts를 아래 내용으로 전체 교체**

기존 토큰(primary, canvas, hairline 등)은 구 페이지 9개가 아직 쓰므로 **남겨두고**, 새 시스템을 추가한다. 단 `ink`/`muted`는 새 값으로 덮어쓴다(구 페이지가 약간 따뜻한 톤으로 바뀌는 것은 의도된 수렴). legacy 표시된 토큰은 Plan 2 마지막에 제거한다.

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
        // ── Warm Paper × Electric (스펙 v2) ──
        paper: "#FAF7F2",
        backdrop: "#131110",
        ink: "#1B1916",
        muted: "#8E887E",
        line: "rgba(27,25,22,0.08)",
        "electric-from": "#FF3D5A",
        "electric-to": "#FF7A3D",
        lilac: "#C9B8FF",
        // ── legacy: Plan 2에서 구 페이지 마이그레이션 후 제거 ──
        primary: "#ff5a6f",
        "primary-active": "#e6475d",
        "primary-soft": "#fff0f2",
        "primary-disabled": "#ffd6dd",
        canvas: "#ffffff",
        "canvas-warm": "#fffaf7",
        "surface-soft": "#f7f7f7",
        body: "#3f3f3f",
        hairline: "#dddddd",
        "hairline-soft": "#ebebeb",
        mint: "#dff8ec",
        "mint-ink": "#147a55",
        lavender: "#f0eaff",
        "lavender-ink": "#5b3ab8",
        sky: "#eaf5ff",
        "sky-ink": "#1f6fb2",
        amber: "#fff3d8",
        "amber-ink": "#9a6700",
      },
      backgroundImage: {
        electric: "linear-gradient(120deg,#FF3D5A,#FF7A3D)",
        dusk: "radial-gradient(140% 90% at 80% -10%, #2B2017 0%, #191512 52%)",
        "shine-text":
          "linear-gradient(110deg,#FF3D5A 25%,#FFC2A1 50%,#FF7A3D 75%)",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "14px",
        lg: "20px",
        card: "24px",
        btn: "18px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 14px 30px rgba(27,25,22,0.07)",
        glow: "0 14px 30px rgba(255,77,61,0.32)",
        ink: "0 14px 28px rgba(27,25,22,0.22)",
        pressed: "0 6px 12px rgba(27,25,22,0.18)",
        frame:
          "0 0 0 10px #2A2520, 0 0 0 11px #45403A, 0 44px 90px rgba(0,0,0,0.65)",
        "btn-primary": "0 4px 18px rgba(255,90,111,0.28)", // legacy
      },
      fontSize: {
        hero: ["32px", { lineHeight: "1.18", fontWeight: "700" }],
        score: ["48px", { lineHeight: "1.0", fontWeight: "800" }],
      },
      // 키프레임 본체는 globals.css에 있다 (.stagger 등 CSS 셀렉터와 공유하기 위함)
      animation: {
        rise: "rise 0.9s cubic-bezier(0.22,1,0.36,1) both",
        drift: "drift 10s ease-in-out infinite alternate",
        "bolt-in": "bolt-in 0.7s cubic-bezier(0.34,1.56,0.64,1) both",
        "glow-breathe": "glow-breathe 3.2s ease-in-out infinite",
        fill: "fill-bar 1.4s cubic-bezier(0.22,1,0.36,1) both",
        shine: "shine 4s linear infinite",
        typing: "typing 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: app/globals.css를 아래 내용으로 전체 교체**

키프레임 이름·타이밍은 모션 카탈로그(`docs/superpowers/specs/2026-06-10-design-refresh-motion-spec.html`)와 1:1 대응이다.

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

/* ── 모션 키프레임 (모션 카탈로그 01~12 기준) ── */
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

/* 스태거 엔트런스: .stagger 직계 자식이 0.12s 간격으로 순차 등장 (모션 01) */
.stagger > * {
  animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.stagger > *:nth-child(1) { animation-delay: 0.05s; }
.stagger > *:nth-child(2) { animation-delay: 0.17s; }
.stagger > *:nth-child(3) { animation-delay: 0.29s; }
.stagger > *:nth-child(4) { animation-delay: 0.41s; }
.stagger > *:nth-child(5) { animation-delay: 0.53s; }
.stagger > *:nth-child(6) { animation-delay: 0.65s; }
.stagger > *:nth-child(7) { animation-delay: 0.77s; }
.stagger > *:nth-child(8) { animation-delay: 0.89s; }
.stagger > *:nth-child(n + 9) { animation-delay: 1.01s; }

/* 매칭 탐색 펄스 닷 — 점멸 + 퍼지는 헤일로 (모션 05) */
.dot-live {
  animation:
    pulse-dot 1.6s ease-in-out infinite,
    halo 1.6s ease-out infinite;
}

/* 칩 선택 팝 (모션 12) */
.chip-pop {
  animation: chip-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 접근성: 모션 최소화 (스펙 요구사항) */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 3: 빌드 + 기존 테스트로 회귀 확인**

Run: `npm run build`
Expected: `✓ Compiled successfully` — 구 페이지들은 legacy 토큰을 그대로 쓰므로 통과해야 한다.

Run: `npm test`
Expected: 5 suites (matching, qa, schedule, scoring, storage) 모두 PASS.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat: add Warm Paper x Electric design tokens and motion keyframes"
```

---

### Task 2: 데스크톱 모바일 프레임 — app/layout.tsx

**Files:**
- Modify: `app/layout.tsx` (전체 교체)

- [ ] **Step 1: app/layout.tsx를 아래 내용으로 전체 교체**

모바일(<640px, Tailwind `sm` 미만)은 풀스크린, 데스크톱은 다크 배경 중앙의 420px 폰 프레임. 스크롤은 프레임 내부 div가 담당한다. 이후 `PageShell`이 `min-h-full`을 쓰려면 이 `h-full` 체인이 필요하다.

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

- [ ] **Step 2: dev 서버에서 시각 확인**

Run: `npm run dev` 후 브라우저에서 `http://localhost:3000`
Expected: 데스크톱 창에서 다크 배경 중앙에 둥근 폰 프레임이 뜨고, 구 홈 화면이 그 안에서 렌더링·스크롤된다. 창을 640px 미만으로 줄이면 풀스크린이 된다.

- [ ] **Step 3: 빌드 확인 후 Commit**

Run: `npm run build` → Expected: 통과

```bash
git add app/layout.tsx
git commit -m "feat: add desktop mobile frame to root layout"
```

---

### Task 3: 프리미티브 1차 — BoltLogo, AuroraBlob, Avatar

**Files:**
- Create: `components/ui/BoltLogo.tsx`
- Create: `components/ui/AuroraBlob.tsx`
- Create: `components/ui/Avatar.tsx`

- [ ] **Step 1: components/ui/BoltLogo.tsx 생성**

`useId`로 그라디언트 id 충돌을 방지한다(한 화면에 볼트 여러 개 가능). `useId`는 서버 컴포넌트에서도 동작한다.

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
      <path
        d="M13 2L4.5 13.5h5.5L9 22l8.5-11.5H12L13 2z"
        fill={fill}
      />
    </svg>
  );
}
```

- [ ] **Step 2: components/ui/AuroraBlob.tsx 생성**

위치/크기/색은 호출부가 className으로 지정한다 (예: `-top-24 -right-28 h-80 w-80 bg-electric-from/15`). 부모에 `relative` + `overflow-hidden` 필요.

```tsx
type Props = { className?: string };

/** 블러 처리된 드리프트 블롭 — 부모에 relative + overflow-hidden 필요 (모션 03) */
export function AuroraBlob({ className = "" }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute animate-drift rounded-full blur-[58px] ${className}`}
    />
  );
}
```

- [ ] **Step 3: components/ui/Avatar.tsx 생성**

`frost`가 스펙의 "비공개의 미학" — 상대팀은 반투명 ? 아바타.

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

- [ ] **Step 4: 빌드 확인 후 Commit**

Run: `npm run build` → Expected: 통과 (아직 미사용이어도 컴파일 대상)

```bash
git add components/ui/BoltLogo.tsx components/ui/AuroraBlob.tsx components/ui/Avatar.tsx
git commit -m "feat: add BoltLogo, AuroraBlob, Avatar primitives"
```

---

### Task 4: 프리미티브 2차 — Button, Card, Chip

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `components/ui/Card.tsx`
- Create: `components/ui/Chip.tsx`

주의: 기존 `components/Button.tsx`(구 버전)는 **삭제하지 않는다**. 구 페이지들이 아직 쓴다 (Plan 2에서 제거).

- [ ] **Step 1: components/ui/Button.tsx 생성**

터치 피드백(모션 02): `active:scale-[0.965]` + 그림자 가라앉음.

```tsx
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ink" | "electric" | "ghost";
  fullWidth?: boolean;
};

export function Button({
  variant = "ink",
  fullWidth = false,
  className = "",
  children,
  ...props
}: Props) {
  const base =
    "flex h-[56px] select-none items-center justify-center gap-2 rounded-btn px-6 text-[15px] font-bold " +
    "transition-[transform,box-shadow] duration-150 active:scale-[0.965] " +
    "disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    ink: "bg-ink text-white shadow-ink active:shadow-pressed",
    electric: "bg-electric text-white shadow-glow active:shadow-pressed",
    ghost: "bg-transparent font-semibold text-muted shadow-none",
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

- [ ] **Step 2: components/ui/Card.tsx 생성**

```tsx
import { HTMLAttributes } from "react";

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
  return (
    <div
      className={`rounded-card p-5 ${variants[variant]} ${press} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: components/ui/Chip.tsx 생성**

선택 시 일렉트릭 하이라이트 + 팝(모션 12). `chip-pop` 클래스는 Task 1의 globals.css에 정의됨.

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
      className={`rounded-full border-[1.5px] px-4 py-2 text-xs font-bold transition-colors duration-150 active:scale-95 ${look} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: 빌드 확인 후 Commit**

Run: `npm run build` → Expected: 통과

```bash
git add components/ui/Button.tsx components/ui/Card.tsx components/ui/Chip.tsx
git commit -m "feat: add Button, Card, Chip primitives with touch feedback"
```

---

### Task 5: 프리미티브 3차 — PageShell, TabBar

**Files:**
- Create: `components/ui/PageShell.tsx`
- Create: `components/ui/TabBar.tsx`

- [ ] **Step 1: components/ui/PageShell.tsx 생성**

`stagger`(기본 on)가 모션 01을 직계 자식에게 자동 적용. `mood="dark"`가 확정 후 다크 무드(Plan 2에서 사용). `withTabBar`는 탭바 높이만큼 하단 패딩 확보.

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

- [ ] **Step 2: components/ui/TabBar.tsx 생성**

글래스 탭바. `absolute bottom-0`은 layout.tsx의 프레임(`relative`)에 붙으므로 스크롤해도 고정된다. 탭 대상은 스펙의 IA: 홈/매칭/채팅/마이.

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

- [ ] **Step 3: 빌드 확인 후 Commit**

Run: `npm run build` → Expected: 통과

```bash
git add components/ui/PageShell.tsx components/ui/TabBar.tsx
git commit -m "feat: add PageShell with stagger entrance and glass TabBar"
```

---

### Task 6: 웰컴 페이지 — app/page.tsx 교체

**Files:**
- Modify: `app/page.tsx` (전체 교체)

- [ ] **Step 1: app/page.tsx를 아래 내용으로 전체 교체**

승인된 `2026-06-10-design-refresh-welcome-live.html`을 그대로 옮긴다. 모션 시퀀스: 볼트 팝(0.25s) → 카피 3줄(0.5/0.68/0.86s) → 서브(1.1s) → CTA(1.35s, 이후 글로우 숨쉬기) → 링크(1.55s). 줄 단위 딜레이가 필요하므로 PageShell의 stagger는 끄고 개별 `animate-rise`를 쓴다.

```tsx
import Link from "next/link";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { BoltLogo } from "@/components/ui/BoltLogo";
import { Button } from "@/components/ui/Button";
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
        <Link href="/test" className="block animate-rise [animation-delay:1.35s]">
          <Button variant="ink" fullWidth className="animate-glow-breathe">
            시작하기 <BoltLogo size={16} variant="electric" />
          </Button>
        </Link>
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

- [ ] **Step 2: dev 서버에서 라이브 프로토타입과 대조**

Run: `npm run dev` 후 `http://localhost:3000`
Expected: 승인본(`docs/superpowers/specs/2026-06-10-design-refresh-welcome-live.html`을 브라우저로 열어 옆에 두고 비교)과 동일한 시퀀스. CTA를 누르면 축소 피드백, 클릭 시 `/test` 이동.

- [ ] **Step 3: 빌드 + 테스트 확인 후 Commit**

Run: `npm run build` && `npm test` → Expected: 모두 통과

```bash
git add app/page.tsx
git commit -m "feat: rebuild welcome page with Warm Paper x Electric design"
```

---

### Task 7: 홈 대시보드 — app/home/page.tsx 신설

**Files:**
- Create: `app/home/page.tsx`

- [ ] **Step 1: app/home/page.tsx 생성**

쇼케이스 02 화면 구현. `loadTeam()`(기존 `lib/storage.ts`, `TeamProfile` 타입)으로 실제 생성된 팀이 있으면 이름/멤버 이니셜을 반영하고, 없으면 쇼케이스 목업 데이터로 폴백한다 — 읽기 전용이므로 "로직 무변경" 원칙 위반이 아니다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { AuroraBlob } from "@/components/ui/AuroraBlob";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { TabBar } from "@/components/ui/TabBar";
import { loadTeam } from "@/lib/storage";

const FALLBACK = { teamName: "공대 F4", initials: ["성", "현", "준"] };

export default function HomeDashboardPage() {
  const [teamName, setTeamName] = useState(FALLBACK.teamName);
  const [initials, setInitials] = useState<string[]>(FALLBACK.initials);

  useEffect(() => {
    const team = loadTeam();
    if (team?.teamName) setTeamName(team.teamName);
    if (team?.members?.length) {
      setInitials(team.members.map((m) => m.nickname.slice(0, 1)));
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
          <Avatar label={initials[0] ?? "부"} />
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

        <Card className="mt-4" pressable>
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

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#B5AFA4"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
```

- [ ] **Step 2: dev 서버에서 쇼케이스 02와 대조**

Run: `npm run dev` 후 `http://localhost:3000/home`
Expected: 쇼케이스 02(홈)와 동일 구성 — 카드들이 스태거로 등장, 펄스 닷 점멸+헤일로, 진행바 차오름, 추천 카드 누르면 축소 피드백, 하단 글래스 탭바 고정(스크롤해도 안 움직임), 탭 이동 동작.

- [ ] **Step 3: 빌드 + 테스트 확인 후 Commit**

Run: `npm run build` && `npm test` → Expected: 모두 통과

```bash
git add app/home/page.tsx
git commit -m "feat: add home dashboard with team card, recommendation, tab bar"
```

---

### Task 8: 최종 검증 + 사용자 룩 컨펌 게이트

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 회귀 확인**

Run: `npm test` → Expected: 5 suites PASS
Run: `npm run build` → Expected: 전체 라우트(구 페이지 포함) 빌드 성공

- [ ] **Step 2: 시각 기준 3종과 최종 대조**

`docs/superpowers/specs/`의 `...-welcome-live.html`, `...-showcase.html`(01·02 화면), `...-motion-spec.html`(01·02·03·05·06 모션)을 브라우저로 열어 dev 서버와 비교. 불일치 항목을 기록한다.

- [ ] **Step 3: prefers-reduced-motion 확인**

브라우저 DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce" 켜기.
Expected: `/`와 `/home`에서 모든 애니메이션이 꺼지고 콘텐츠는 전부 보인다 (opacity 0으로 숨는 요소 없음).

- [ ] **Step 4: 사용자 룩 컨펌 (게이트)**

dev 서버를 사용자에게 보여주고 웰컴 + 홈의 룩을 컨펌받는다.
**컨펌 전에는 Plan 2(기존 페이지 마이그레이션)를 시작하지 않는다.**
컨펌 후: Plan 2 작성 → 실행 → 완료 시 Codex 감사(`/codex:review`)는 Plan 2 종료 시점에 전체 diff로 진행한다.
