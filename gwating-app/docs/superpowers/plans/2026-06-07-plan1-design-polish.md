# ë¶€????Plan 1: ?”ì???´ë¦¬??+ ë¦¬ë¸Œ?œë”© Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** ê¸°ì¡´ 5ê°??˜ì´ì§€ ?„ì²´??ë¹„ì£¼?¼ì„ "Soft Warm" ë°©í–¥?¼ë¡œ ?´ë¦¬?œí•˜ê³????´ë¦„??"ë¶€???¼ë¡œ ë¦¬ë¸Œ?œë”©?œë‹¤. ??ê¸°ëŠ¥Â·?€??ë³€ê²??†ìŒ.

**Architecture:** ?œìˆ˜ UI ?ˆì´?´ë§Œ ë³€ê²? Tailwind ? í° ì¶”ê? ??ê³µí†µ ì»´í¬?ŒíŠ¸ ?…ë°?´íŠ¸ ???˜ì´ì§€ ?ˆì´?„ì›ƒ ?œìœ¼ë¡?ì§„í–‰. ê¸°ì¡´ ë¡œì§(`lib/`, `data/`, `types/`)?€ ?ë?ì§€ ?ŠìŒ.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v3, Pretendard Variable

---

## ?Œì¼ ë§?
| ?Œì¼ | ?‘ì—… |
|------|------|
| `tailwind.config.ts` | `card` border-radius ? í° ì¶”ê? |
| `app/layout.tsx` | ???€?´í? ??"ë¶€?? |
| `components/AppHeader.tsx` | ë¶€??ë¡œê³ , backdrop-blur, ?¤í???|
| `components/Button.tsx` | ê·¸ë¼?”ì–¸??primary, rounded-[14px] |
| `components/MoodChip.tsx` | border ?ê»˜ ??1.5px, ?°íŠ¸ ??|
| `components/QuizCard.tsx` | ê·¸ë¼?”ì–¸???„ë¡œê·¸ë ˆ?¤ë°”, rounded-[12px] ? íƒì§€ |
| `components/TeamProfileCard.tsx` | ?„ë°”?€ ê·¸ë¼?”ì–¸?? êµ¬ë¶„?? ?€??ë±ƒì? |
| `components/MatchScoreCard.tsx` | ?ˆì´ë¸????œêµ­??"ê¶í•© ?ìˆ˜" |
| `components/MatchReasonList.tsx` | ?„ì´ì½?+ ?ìŠ¤???¤í???|
| `components/RecommendationTeamCard.tsx` | rank ê°•ì¡°, ?„ë°”?€ ê·¸ë¼?”ì–¸??|
| `app/page.tsx` | Ultra-minimal ???„ë©´ ?¬ì‘??|
| `app/test/page.tsx` | ê²°ê³¼ ?”ë©´???±í–¥ ?ìˆ˜ ë°?ì¶”ê? |
| `app/team/create/page.tsx` | ë¶„ìœ„ê¸?? íƒ ???¼ë””??ì¹´ë“œ?? ?¸í’‹ ?¤í???|
| `app/team/demo/page.tsx` | bg-canvas-warm ? ì?, ?´ë¦¬??|
| `app/match/page.tsx` | ?¤ë” ì¹´í”¼, ì¹´ë“œ bg ??white, ?ˆì´?„ì›ƒ ?Œí­ |

---

## Task 1: Tailwind ? í° ì¶”ê?

**Files:**
- Modify: `tailwind.config.ts`

- [x] **Step 1: `card` ? í° ì¶”ê? ë°?ê¸°ì¡´ ? í° ?•ì¸**

`tailwind.config.ts`??`borderRadius` ?¹ì…˜??`card` ì¶”ê?:

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

- [x] **Step 2: ë¹Œë“œ ?•ì¸**

```bash
cd dating-app/gwating-app
npm run build 2>&1 | tail -5
```

Expected: `??Compiled successfully` (?ëŠ” ê²½ê³  ?†ì´ ?„ë£Œ)

- [x] **Step 3: ì»¤ë°‹**

```bash
git add tailwind.config.ts
git commit -m "style: add card border-radius token and btn-primary shadow"
```

---

## Task 2: ???€?´í? ë¦¬ë¸Œ?œë”©

**Files:**
- Modify: `app/layout.tsx`

- [x] **Step 1: metadata ?€?´í? ë³€ê²?*

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ë¶€????ë¶€?°ë? ê³¼íŒ…",
  description: "?¹ì‹ ???°ì• ?¸í¬ë¥?ë¶€?…í•˜?¸ìš”! ë¶€?°ë????„ìš© ?€ ê³¼íŒ… ?œë¹„??,
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

- [x] **Step 2: ì»¤ë°‹**

```bash
git add app/layout.tsx
git commit -m "brand: rename app title to ë¶€??
```

---

## Task 3: AppHeader ë¦¬ë¸Œ?œë”©

**Files:**
- Modify: `components/AppHeader.tsx`

- [x] **Step 1: ì»´í¬?ŒíŠ¸ ?¬ì‘??*

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
            ??          </div>
          <span className="font-black text-ink text-[15px] tracking-[-0.5px]">ë¶€??/span>
        </Link>
        {step !== undefined && totalSteps !== undefined && (
          <span className="text-[10px] font-bold text-muted">
            {step} / {totalSteps} ?¨ê³„
          </span>
        )}
      </div>
    </header>
  );
}
```

- [x] **Step 2: ê°œë°œ ?œë²„ ?•ì¸**

```bash
npm run dev
```

ë¸Œë¼?°ì??ì„œ `http://localhost:3000` ???¤ë”????ë¶€??ë¡œê³  ?•ì¸

- [x] **Step 3: ì»¤ë°‹**

```bash
git add components/AppHeader.tsx
git commit -m "style: rebrand AppHeader to ë¶€??with gradient icon"
```

---

## Task 4: Button ì»´í¬?ŒíŠ¸ ë¦¬ë””?ì¸

**Files:**
- Modify: `components/Button.tsx`

- [x] **Step 1: ì»´í¬?ŒíŠ¸ ?¬ì‘??*

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

- [x] **Step 2: ê¸°ì¡´ ?ŒìŠ¤???µê³¼ ?•ì¸**

```bash
npm test -- --testPathPattern="__tests__" 2>&1 | tail -10
```

Expected: ê¸°ì¡´ ?ŒìŠ¤???„ë? pass (Button?€ ë¡œì§ ?†ìœ¼ë¯€ë¡??ŒìŠ¤???†ìŒ)

- [x] **Step 3: ì»¤ë°‹**

```bash
git add components/Button.tsx
git commit -m "style: redesign Button with gradient primary and hover lift"
```

---

## Task 5: MoodChip ?´ë¦¬??
**Files:**
- Modify: `components/MoodChip.tsx`

- [x] **Step 1: border ?ê»˜, ?°íŠ¸ ?…ë°?´íŠ¸**

```tsx
// components/MoodChip.tsx
import { MoodKey } from "@/types/matching";

const MOOD_CONFIG: Record<
  MoodKey,
  { label: string; bg: string; text: string; border: string }
> = {
  comfortableTalk: { label: "?¸í•œ ?€?”í˜•",        bg: "bg-primary-soft",  text: "text-primary",      border: "border-primary-disabled" },
  activeSocial:    { label: "?œë°œ??ì¹œëª©??,       bg: "bg-mint",          text: "text-mint-ink",     border: "border-mint-ink"         },
  gamesAndDrinks:  { label: "ê²Œì„/? ìë¦¬í˜•",       bg: "bg-amber",         text: "text-amber-ink",    border: "border-amber-ink"        },
  respectfulSafe:  { label: "?ˆì˜/?ˆì „ ì¤‘ì‹œ??,    bg: "bg-lavender",      text: "text-lavender-ink", border: "border-lavender-ink"     },
  naturalIntro:    { label: "?ì—°?¤ëŸ¬???Œê°œ?…í˜•", bg: "bg-sky",           text: "text-sky-ink",      border: "border-sky-ink"          },
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

- [x] **Step 2: ì»¤ë°‹**

```bash
git add components/MoodChip.tsx
git commit -m "style: polish MoodChip border weight and font-bold"
```

---

## Task 6: QuizCard ë¦¬ë””?ì¸

**Files:**
- Modify: `components/QuizCard.tsx`

- [x] **Step 1: ê·¸ë¼?”ì–¸???„ë¡œê·¸ë ˆ?¤ë°” + ? íƒì§€ ?¤í???*

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
        <span className="text-[10px] font-bold text-primary">ì§ˆë¬¸ {current} / {total}</span>
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

- [x] **Step 2: ê¸°ì¡´ ?´ì¦ˆ ?ŒìŠ¤???µê³¼ ?•ì¸**

```bash
npm test -- --testPathPattern="scoring|matching" 2>&1 | tail -10
```

Expected: pass (QuizCard?€ ?œìˆ˜ UI, ê¸°ì¡´ ë¡œì§ ?ŒìŠ¤?¸ì— ?í–¥ ?†ìŒ)

- [x] **Step 3: ì»¤ë°‹**

```bash
git add components/QuizCard.tsx
git commit -m "style: redesign QuizCard with gradient progress bar"
```

---

## Task 7: ???˜ì´ì§€ ?„ë©´ ?¬ì‘??
**Files:**
- Modify: `app/page.tsx`

- [x] **Step 1: Ultra-minimal splash ?ˆì´?„ì›ƒ?¼ë¡œ êµì²´**

```tsx
// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-between px-7 pt-14 pb-10">
      {/* ?ë‹¨: ë¡œê³  */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg shadow-[0_3px_10px_rgba(255,90,111,0.25)]">
            ??          </div>
          <span className="text-[22px] font-black text-ink tracking-[-0.8px]">ë¶€??/span>
        </div>
        <p className="text-[10px] font-semibold text-muted tracking-[1.5px] uppercase">
          ë¶€?°ë? ê³¼íŒ… ?œë¹„??        </p>
      </div>

      {/* ì¤‘ì•™: ?¼ëŸ¬?¤íŠ¸ */}
      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-primary-soft border-2 border-primary-disabled flex items-center justify-center text-[56px] shadow-[0_8px_32px_rgba(255,90,111,0.10)]">
          ?‰
        </div>
        <span className="absolute -top-1 -right-1 text-xl">??/span>
        <span className="absolute -bottom-1 -left-3 text-lg">?’¬</span>
      </div>

      {/* ?˜ë‹¨: ì¹´í”¼ + CTA */}
      <div className="w-full text-center">
        <h1 className="text-[21px] font-black text-ink leading-snug tracking-[-0.6px] mb-1.5">
          ?¹ì‹ ???°ì• ?¸í¬ë¥?          <br />
          <span className="text-primary">ë¶€??/span>?˜ì„¸??
        </h1>
        <p className="text-xs text-muted mb-6 leading-relaxed">
          ë¶€?°ë??ë¼ë¦??€???´ë¤„
          <br />
          ??ë§ëŠ” ?ë??€ê³??¤ë ˆ??ê³¼íŒ…??        </p>
        <Link href="/test" className="block mb-3">
          <Button variant="primary" fullWidth>
            ?±í–¥ ?ŒìŠ¤???œì‘?˜ê¸° ??          </Button>
        </Link>
        <Link href="/team/create" className="text-xs text-muted">
          ?€ ì´ˆë?ë¥?ë°›ìœ¼?¨ë‚˜??{" "}
          <span className="text-primary font-bold">ì½”ë“œë¡??©ë¥˜</span>
        </Link>
      </div>
    </main>
  );
}
```

`Button` import ì¶”ê?:

```tsx
import { Button } from "@/components/Button";
```

?„ì²´ ?Œì¼:

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
            ??          </div>
          <span className="text-[22px] font-black text-ink tracking-[-0.8px]">ë¶€??/span>
        </div>
        <p className="text-[10px] font-semibold text-muted tracking-[1.5px] uppercase">
          ë¶€?°ë? ê³¼íŒ… ?œë¹„??        </p>
      </div>

      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-primary-soft border-2 border-primary-disabled flex items-center justify-center text-[56px] shadow-[0_8px_32px_rgba(255,90,111,0.10)]">
          ?‰
        </div>
        <span className="absolute -top-1 -right-1 text-xl">??/span>
        <span className="absolute -bottom-1 -left-3 text-lg">?’¬</span>
      </div>

      <div className="w-full text-center">
        <h1 className="text-[21px] font-black text-ink leading-snug tracking-[-0.6px] mb-1.5">
          ?¹ì‹ ???°ì• ?¸í¬ë¥?          <br />
          <span className="text-primary">ë¶€??/span>?˜ì„¸??
        </h1>
        <p className="text-xs text-muted mb-6 leading-relaxed">
          ë¶€?°ë??ë¼ë¦??€???´ë¤„
          <br />
          ??ë§ëŠ” ?ë??€ê³??¤ë ˆ??ê³¼íŒ…??        </p>
        <Link href="/test" className="block mb-3">
          <Button variant="primary" fullWidth>
            ?±í–¥ ?ŒìŠ¤???œì‘?˜ê¸° ??          </Button>
        </Link>
        <Link href="/team/create" className="text-xs text-muted">
          ?€ ì´ˆë?ë¥?ë°›ìœ¼?¨ë‚˜??{" "}
          <span className="text-primary font-bold">ì½”ë“œë¡??©ë¥˜</span>
        </Link>
      </div>
    </main>
  );
}
```

- [x] **Step 2: ë¸Œë¼?°ì??ì„œ ???•ì¸**

`http://localhost:3000` ??ë¡œê³  + ?¼ëŸ¬?¤íŠ¸ + CTA 2ê°œë§Œ ë³´ì´?”ì? ?•ì¸.  
ê¸°ì¡´ "?´ë–»ê²?ì§„í–‰?˜ë‚˜??" ?¹ì…˜ê³?ë¬´ë“œ ì¹©ì´ ?†ì–´????

- [x] **Step 3: ì»¤ë°‹**

```bash
git add app/page.tsx
git commit -m "feat: redesign home page as ultra-minimal ë¶€??splash"
```

---

## Task 8: ?±í–¥ ?ŒìŠ¤??ê²°ê³¼ ?”ë©´ ???ìˆ˜ ë°?ì¶”ê?

**Files:**
- Modify: `app/test/page.tsx`

ê²°ê³¼ ?”ë©´???‰ë„¤???…ë ¥ ?„ì— ?±í–¥ ?ìˆ˜ ë°?4ê°œë? ì¶”ê??œë‹¤.  
`finalTraits`???´ë? ê³„ì‚°?˜ì–´ ?ˆìœ¼ë¯€ë¡?ë¡œì§ ë³€ê²??†ìŒ.

- [x] **Step 1: ê²°ê³¼ ?”ë©´ JSX êµì²´**

`app/test/page.tsx`?ì„œ `showNickname && resultRole` ë¶„ê¸°??returnë¬¸ë§Œ êµì²´:

```tsx
if (showNickname && resultRole) {
  const info = ROLE_LABELS[resultRole];
  const traitLabels: Record<string, string> = {
    atmosphereCoordination: "ë¶„ìœ„ê¸?ì¡°ìœ¨",
    consideration:          "ë°°ë ¤??,
    participation:          "?ê·¹??,
    communicationBalance:   "?Œí†µ ê· í˜•",
  };

  return (
    <>
      <AppHeader step={1} totalSteps={3} />
      <main className="py-10 px-4 bg-white min-h-screen">
        <div className="max-w-[480px] mx-auto">
          {/* ??•  ê²°ê³¼ */}
          <div className="text-center mb-8">
            <div className="text-[52px] mb-3 drop-shadow-sm">{info.emoji}</div>
            <h2 className="text-2xl font-black text-ink tracking-[-0.5px] mb-2">{info.name}</h2>
            <p className="text-sm text-muted leading-relaxed">{info.desc}</p>
          </div>

          {/* ?±í–¥ ?ìˆ˜ ë°?*/}
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

          {/* ?‰ë„¤???…ë ¥ */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-ink mb-2">
              ?‰ë„¤?„ì„ ?…ë ¥?´ì£¼?¸ìš”
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="?? ë¯¼ì?"
              maxLength={10}
              className="w-full border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white"
            />
          </div>
          <Button fullWidth onClick={handleSave} disabled={!nickname.trim()}>
            ?€ ë§Œë“¤??ê°€ê¸???          </Button>
        </div>
      </main>
    </>
  );
}
```

- [x] **Step 2: ë¸Œë¼?°ì??ì„œ ?ŒìŠ¤???Œë¡œ???•ì¸**

`http://localhost:3000/test` ??10ë¬¸í•­ ?„ë£Œ ??ê²°ê³¼ ?”ë©´???ìˆ˜ ë°?4ê°??œì‹œ ?•ì¸

- [x] **Step 3: ?´ì¦ˆ ì§„í–‰ ?”ë©´ ë°°ê²½??ë³€ê²?*

ê°™ì? ?Œì¼???´ì¦ˆ ì§„í–‰ ì¤?returnë¬¸ì—??`bg-canvas-warm` ??`bg-white` ë¡?ë³€ê²?

```tsx
// ?´ì¦ˆ ì§„í–‰ ì¤?return
return (
  <>
    <AppHeader step={1} totalSteps={3} />
    <main className="py-10 px-4 bg-white min-h-screen">  {/* bg-canvas-warm ??bg-white */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-ink tracking-[-0.5px]">?˜ì˜ ê³¼íŒ… ?¤í??¼ì??</h1>
        <p className="text-sm text-muted mt-1">?í™©???½ê³  ?”ì§?˜ê²Œ ê³¨ë¼ì£¼ì„¸??/p>
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

- [x] **Step 4: ì»¤ë°‹**

```bash
git add app/test/page.tsx
git commit -m "style: add trait score bars to test result, polish quiz screen"
```

---

## Task 9: TeamProfileCard ?´ë¦¬??
**Files:**
- Modify: `components/TeamProfileCard.tsx`

- [x] **Step 1: ?„ë°”?€ ê·¸ë¼?”ì–¸??+ êµ¬ë¶„??+ ?€??ë±ƒì? ?¤í???*

```tsx
// components/TeamProfileCard.tsx
import { TeamProfile, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";

const ROLE_INFO: Record<MemberRole, { label: string; emoji: string }> = {
  moodMaker:   { label: "ë¶„ìœ„ê¸?ë©”ì´ì»¤í˜•", emoji: "?”¥" },
  coordinator: { label: "ì¡°ìœ¨?í˜•",         emoji: "?¯" },
  considerate: { label: "ë°°ë ¤??,           emoji: "?¤" },
  reactor:     { label: "ë¦¬ì•¡?˜í˜•",         emoji: "?? },
};

type Props = { team: TeamProfile };

export function TeamProfileCard({ team }: Props) {
  const initials = team.teamName.slice(0, 2);

  return (
    <div className="bg-white rounded-card shadow-card p-5 max-w-[480px] w-full">
      {/* ?€ ?„ì´?´í‹°??*/}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-primary to-[#ff7e5f] flex items-center justify-center text-lg font-black text-white shadow-[0_3px_10px_rgba(255,90,111,0.25)] shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="text-[18px] font-black text-ink tracking-[-0.4px]">{team.teamName}</h2>
          <p className="text-xs text-muted mt-0.5">
            {team.school} Â· {team.size}ëª?Â· {team.ageRange}??          </p>
        </div>
      </div>

      {/* ë¶„ìœ„ê¸?*/}
      <div className="mb-4">
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">?í•˜??ë¶„ìœ„ê¸?/p>
        <MoodChip mood={team.mood} selected />
      </div>

      {/* ?€??*/}
      <div>
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">?€??êµ¬ì„±</p>
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
                      ?€??                    </span>
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

- [x] **Step 2: ì»¤ë°‹**

```bash
git add components/TeamProfileCard.tsx
git commit -m "style: polish TeamProfileCard with gradient avatar and dividers"
```

---

## Task 10: ë§¤ì¹­ ê´€??ì»´í¬?ŒíŠ¸ ?´ë¦¬??
**Files:**
- Modify: `components/MatchScoreCard.tsx`
- Modify: `components/MatchReasonList.tsx`
- Modify: `components/RecommendationTeamCard.tsx`

- [x] **Step 1: MatchScoreCard ???ˆì´ë¸??œêµ­?´í™”**

```tsx
// components/MatchScoreCard.tsx
import { MatchResult } from "@/types/matching";

const LABEL_COLORS: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "text-primary",
  "Good with some differences":       "text-amber-ink",
  "Different atmosphere preferences": "text-muted",
};

const LABEL_KO: Record<MatchResult["label"], string> = {
  "Strong vibe fit":                  "ë¶„ìœ„ê¸??„ë²½ ?¼ì¹˜",
  "Good with some differences":       "?€ì²´ë¡œ ??ë§ì•„??,
  "Different atmosphere preferences": "?¤í??¼ì´ ì¡°ê¸ˆ ?¬ë¼??,
};

type Props = { score: number; label: MatchResult["label"] };

export function MatchScoreCard({ score, label }: Props) {
  return (
    <div className="text-right shrink-0">
      <p className="text-[32px] font-black text-primary leading-none tracking-[-1px]">
        {score}
        <span className="text-base">%</span>
      </p>
      <p className="text-[10px] font-bold text-muted mt-0.5">ê¶í•© ?ìˆ˜</p>
      <p className={`text-[10px] font-semibold mt-0.5 ${LABEL_COLORS[label]}`}>
        {LABEL_KO[label]}
      </p>
    </div>
  );
}
```

- [x] **Step 2: MatchReasonList ???„ì´ì½?+ ?ìŠ¤???¤í???*

```tsx
// components/MatchReasonList.tsx
type Props = { reasons: string[] };

export function MatchReasonList({ reasons }: Props) {
  return (
    <ul className="flex flex-col gap-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-body leading-snug">
          <span className="text-primary shrink-0 mt-0.5">??/span>
          {r}
        </li>
      ))}
    </ul>
  );
}
```

- [x] **Step 3: RecommendationTeamCard ??rank ê°•ì¡° + ?„ë°”?€ ê·¸ë¼?”ì–¸??*

```tsx
// components/RecommendationTeamCard.tsx
import { MatchResult, MemberRole } from "@/types/matching";
import { MoodChip } from "./MoodChip";
import { MatchScoreCard } from "./MatchScoreCard";
import { MatchReasonList } from "./MatchReasonList";

const ROLE_EMOJI: Record<MemberRole, string> = {
  moodMaker: "?”¥", coordinator: "?¯", considerate: "?¤", reactor: "??,
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
              {team.school} Â· {team.size}ëª?Â· {team.ageRange}??            </p>
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

- [x] **Step 4: ë¸Œë¼?°ì??ì„œ `/match` ?•ì¸**

?€??ë§Œë“  ??`http://localhost:3000/match` ??1??ì¹´ë“œ???‘í¬ ?Œë‘ë¦? ê·¸ë¼?”ì–¸???„ë°”?€ ?•ì¸

- [x] **Step 5: ì»¤ë°‹**

```bash
git add components/MatchScoreCard.tsx components/MatchReasonList.tsx components/RecommendationTeamCard.tsx
git commit -m "style: polish match result cards with gradient avatars and KO labels"
```

---

## Task 11: ?€ ë§Œë“¤ê¸??˜ì´ì§€ ?´ë¦¬??
**Files:**
- Modify: `app/team/create/page.tsx`

?¸í’‹Â·ë¶„ìœ„ê¸?? íƒÂ·?€??ì¹´ë“œ???œê°???¤í??¼ë§Œ ?…ë°?´íŠ¸. ë¡œì§ ë³€ê²??†ìŒ.

- [x] **Step 1: ?¸í’‹ ?¤í????´ë˜???…ë°?´íŠ¸**

?Œì¼ ?„ì²´?ì„œ ?¤ìŒ ?´ë˜?¤ë? ì¹˜í™˜:

| ê¸°ì¡´ | ë³€ê²?|
|------|------|
| `border border-hairline rounded-sm px-4 h-12 text-base text-ink focus:outline-none focus:border-primary` | `border-[1.5px] border-hairline rounded-[12px] px-4 h-12 text-base text-ink focus:outline-none focus:border-primary bg-white` |
| `border border-dashed border-hairline rounded-md py-3 text-sm text-muted hover:border-primary hover:text-primary transition-colors` | `border-[1.5px] border-dashed border-hairline rounded-[12px] py-3 text-sm text-muted hover:border-primary hover:text-primary transition-colors` |
| `border border-primary bg-primary-soft rounded-md p-4 text-sm` | `bg-gradient-to-br from-primary-soft to-[#fff0f4] border-[1.5px] border-primary-disabled rounded-[14px] p-4 text-sm` |

- [x] **Step 2: ?¹ì…˜ ?¼ë²¨ ?¤í????…ë°?´íŠ¸**

?Œì¼ ?„ì²´?ì„œ `text-sm font-semibold text-ink mb-2` ??`text-xs font-bold text-ink mb-2 uppercase tracking-wide` ë¡?ë³€ê²?(`label` className ë¶€ë¶„ë§Œ)

- [x] **Step 3: placeholder ?ìŠ¤??ë³€ê²?*

?€ ?´ë¦„ input??placeholder:
```
"?? ?œë©´ ?œë¦¬ë¨¸ì¦ˆ" ??"?? ì»´ê³µ ?•ì?? ê²½ì˜ ?¬ì‹ ??
```

- [x] **Step 4: ë¸Œë¼?°ì??ì„œ `/team/create` ?•ì¸**

?¸í’‹ ?Œë‘ë¦?1.5px, ?¼ë²¨ uppercase, ?€??ì¹´ë“œ ê·¸ë¼?”ì–¸??ë°°ê²½ ?•ì¸

- [x] **Step 5: ì»¤ë°‹**

```bash
git add app/team/create/page.tsx
git commit -m "style: polish team create page inputs and labels"
```

---

## Task 12: ?€ ?„ë¡œ??+ ë§¤ì¹­ ?˜ì´ì§€ ?´ë¦¬??
**Files:**
- Modify: `app/team/demo/page.tsx`
- Modify: `app/match/page.tsx`

- [x] **Step 1: team/demo ?˜ì´ì§€ ???¤ë” ì¹´í”¼ ?´ë¦¬??*

```tsx
// app/team/demo/page.tsx (?´ë¦¬??ë¶€ë¶„ë§Œ)
// h1, p ?ìŠ¤?¸ëŠ” ê·¸ë?ë¡?? ì?
// bg-canvas-warm ??bg-white ë³€ê²?<main className="py-10 px-4 bg-white min-h-screen">
```

- [x] **Step 2: match ?˜ì´ì§€ ???¤ë” ì¹´í”¼ + ë°°ê²½**

```tsx
// app/match/page.tsx
// bg-canvas-warm ??bg-white
// h1 font-black tracking-[-0.5px] ì¶”ê?
// "ì¶”ì²œ ê³¼íŒ… ?€" ?˜ë‹¨ p ??text-xs ë¡?ë³€ê²?
<main className="py-10 px-4 bg-white min-h-screen">
  <div className="max-w-[640px] mx-auto">
    <h1 className="text-2xl font-black text-ink tracking-[-0.5px] mb-1">ì¶”ì²œ ê³¼íŒ… ?€</h1>
    <p className="text-xs text-muted mb-8">
      <span className="font-bold text-ink">{myTeam.teamName}</span>ê³????´ìš¸ë¦??€??ë¶„ìœ„ê¸°Â·ì—­? Â·ì¡°ê±?ê¶í•©?¼ë¡œ ì¶”ì²œ?ˆì–´??
    </p>
    {/* ?˜ë¨¸ì§€ ?™ì¼ */}
```

- [x] **Step 3: ë¹Œë“œ ìµœì¢… ?•ì¸**

```bash
npm run build 2>&1 | tail -10
```

Expected: ?ëŸ¬ ?†ì´ ë¹Œë“œ ?±ê³µ

- [x] **Step 4: ?„ì²´ ?ŒìŠ¤???•ì¸**

```bash
npm test 2>&1 | tail -15
```

Expected: ê¸°ì¡´ ?ŒìŠ¤???„ë? pass

- [x] **Step 5: ìµœì¢… ì»¤ë°‹**

```bash
git add app/team/demo/page.tsx app/match/page.tsx
git commit -m "style: polish team demo and match pages background and typography"
```

---

## ?€??ë¦¬ë·° ì²´í¬ë¦¬ìŠ¤??
- [x] **Spec ì»¤ë²„ë¦¬ì?**: Task 1~12ê°€ ?¤í™ Â§2 ë¹„ì£¼???¸ì–´, Â§3-1~3-4, Â§3-12 ë§¤ì¹­ ì¹´ë“œ ?´ë¦¬???„ë? ì»¤ë²„
- [x] **Placeholder ?†ìŒ**: ëª¨ë“  step???¤ì œ ì½”ë“œ ?¬í•¨
- [x] **?€???¼ê???*: `MatchResult`, `TeamProfile`, `MemberRole` ëª¨ë‘ ê¸°ì¡´ `types/matching.ts` ê·¸ë?ë¡??¬ìš©, ë³€ê²??†ìŒ
- [x] **?„ë½ ?†ìŒ**: MoodChip(Task 5), Button(Task 4), AppHeader(Task 3) ê³µí†µ ì»´í¬?ŒíŠ¸ ë¨¼ì? ì²˜ë¦¬ ???˜ì´ì§€ ?ìš© ?œì„œë¡??˜ì¡´??ì¶©ì¡±
