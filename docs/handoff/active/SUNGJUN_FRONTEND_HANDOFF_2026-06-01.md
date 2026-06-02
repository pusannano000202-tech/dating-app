# 성준 인수인계서 — 프론트엔드 전체 공유 + 데일리카드 착수 가이드

> **작성일**: 2026-06-01 · 작성자: 충현 (Claude Code 세션)
> **받는 사람**: 성준
> **목적**: 충현이 만들어 둔 **프론트엔드 전체 구조·컨벤션·디자인 시스템**을 한 파일로 공유. 성준이 이걸 보고 **데일리카드 화면을 기존과 똑같은 스타일로** 붙일 수 있게 한다.
> **이 파일만 다운받아도 됨** — 자기완결형. 데일리카드 경계 합의는 같은 폴더 `SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md` 참조.

---

## 0. 30초 핵심

- **Next.js 14 App Router + TypeScript + Tailwind + Supabase.** 외부 UI 라이브러리 없음(아이콘만 `lucide-react`).
- 페이지 = `app/.../page.tsx` (`'use client'`), 데이터는 **항상 `/api/...` route 경유**, route는 **Supabase RPC만 호출**. 컴포넌트가 DB 직접 안 침.
- 디자인 = **다크 글래스모피즘**. `.glass-card` / `.btn-gradient` 등 **이미 정의된 유틸 클래스 조합**으로만 만든다 (직접 색 칠하지 말 것).
- 모바일 우선: 모든 페이지 `max-w-md mx-auto`. 카피는 한국어 반말존댓(~요/~어요), 친근체.
- **데일리카드는 코드 0줄.** 이 문서의 §6 템플릿 그대로 복붙하면 일관성 유지됨.

---

## 1. 기술 스택 (package.json 실측)

```
next            14.2.35   (App Router)
react / dom     18
typescript      5
tailwindcss     3.4.1
@supabase/ssr   0.5.2     ← 브라우저/서버 클라이언트
@supabase/supabase-js 2.49.4
lucide-react    1.16.0    ← 아이콘 (유일한 UI 의존)
```

**없는 것**: 상태관리 라이브러리(redux/zustand) 없음, 데이터페칭 라이브러리(react-query/swr) 없음, 컴포넌트 라이브러리(shadcn/mui) 없음. 전부 순수 `fetch` + `useState`/`useEffect`.

### 검증 명령

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm run build         # 프로덕션 빌드
npm run test:matching # 매칭 순수함수 테스트 (node:test)
npm run test:auth / test:config / test:profile
```

> 새 화면 추가 후 **반드시 `npm run typecheck` + `npm run build` PASS** 확인.

---

## 2. 디렉토리 구조 (실측, 프론트 관련만)

```
app/
├── layout.tsx                 # 루트 레이아웃 (폰트/배경)
├── page.tsx                   # 랜딩 + MatchingPool
├── loading.tsx / error.tsx / not-found.tsx
├── globals.css                # ★ 디자인 시스템 전부 여기 (§4)
├── (auth)/login/page.tsx      # OTP/소셜 로그인
├── auth/callback/route.ts     # OAuth 콜백 (Codex)
├── profile/                   # 온보딩 8단계 (충현)
│   ├── layout.tsx             # StepProgress 진행바 래핑
│   ├── school/ basic/ worldcup/ photos/ survey/
│   ├── personality-preference/ schedule/ preferences/
│   ├── complete/ edit/
├── friends/page.tsx
├── group/
│   ├── layout.tsx
│   ├── create/page.tsx        # 그룹+초대+보증금+큐 진입
│   └── invite/[token]/page.tsx
├── match/
│   ├── page.tsx               # 매칭 목록
│   └── [id]/
│       ├── page.tsx           # 매칭 상세 (GPS 체크인/노쇼) ← 데일리카드 캐러셀 들어갈 자리
│       ├── review/ continuation/ refund/
├── notifications/page.tsx
├── debug/sanji/page.tsx       # ⚠️ 임시 프리뷰, 출시 전 삭제
└── api/                       # §5 — 모든 route.ts (REST → RPC 어댑터)

components/
├── DestinyLogo.tsx
├── MatchingPool.tsx           # 풀 현황 시각화
├── NotificationBell.tsx       # 미읽음 배지
├── SanjiCharacter.tsx         # 마스코트 SVG (4표정)
└── profile/                   # 온보딩 단계별 컴포넌트 12개

lib/
├── supabase.ts                # createClient() — 브라우저용
├── supabase-server.ts         # createSupabaseServerClient() — route용
├── types.ts                   # ★ 공용 타입 (수정 시 PR+리뷰 필수)
├── constants.ts               # DEPOSIT_AMOUNT 등
├── utils.ts                   # cn() / getSupabaseConfigIssue() 등
├── matching/                  # 매칭 점수 순수함수 (config/score/time/filter)
├── appearance/                # 외모 벡터 유틸
├── auth/school-email.ts
└── refund/fee-flow.ts
```

---

## 3. 데이터 흐름 — 3계층 (이 패턴 절대 깨지 말 것)

```
[1] page.tsx ('use client')
      fetch('/api/...')  ←── 컴포넌트는 절대 supabase 직접 안 부름 (RPC도 X)
        │
[2] app/api/.../route.ts (서버)
      createSupabaseServerClient()
      supabase.auth.getUser()       ← 인증 가드
      supabase.rpc('함수명', {...})  ← DB 접근은 RPC만
        │
[3] Supabase Postgres
      SECURITY DEFINER RPC + RLS bypass guard (마이그 영역, 충현)
```

**왜 이렇게?** RLS + bypass guard 패턴(CODEX_MASTER §10) 때문에 모든 쓰기는 RPC를 거쳐야 함. route는 그 RPC를 감싸는 얇은 어댑터일 뿐.

### 예외

- `MatchingPool` 등 **읽기 전용 공개 데이터**는 page에서 `createClient()`(브라우저)로 직접 RPC 조회하기도 함. 쓰기는 무조건 route 경유.

---

## 4. 디자인 시스템 — `globals.css` 클래스 치트시트 (★★★)

**새 색을 칠하지 말고 아래 클래스를 조합한다.** 전부 `app/globals.css`에 정의됨.

### 배경 / 컨테이너

| 클래스 | 용도 |
|---|---|
| `.glass` | 기본 반투명 패널 (헤더 버튼 등) |
| `.glass-strong` | 더 진한 글래스 |
| `.glass-card` | ★ 메인 카드. 핑크빛 그라디언트 글래스 + 그림자. **콘텐츠 박스는 거의 이거** |
| `.glass-rose` | 강조 카드 (로즈/바이올렛 틴트) |
| `.bg-app` | 앱 전역 배경 그라디언트 (body에 이미 적용됨) |

### 버튼

| 클래스 | 용도 |
|---|---|
| `.btn-gradient` | ★ 기본 CTA (보라→핑크→앰버). `:disabled` 자동 처리 |
| `.btn-gradient-animated` | 그라디언트 흐르는 강조 CTA |

### 텍스트 그라디언트 / 폰트

| 클래스 | 용도 |
|---|---|
| `.gradient-brand-text` | 보라-핑크-옐로 텍스트 |
| `.gradient-fate-text` | 핑크-퍼플 텍스트 (감성 강조, "양쪽 모두 이어가기" 류) |
| `.font-destiny` | Playfair Display serif (로고/타이틀) |
| 본문 기본 | Pretendard (자동) |

### 애니메이션 유틸

`.animate-pulse-glow` `.animate-star` `.animate-float` `.confetti-fall` `.animate-wiggle`(산지니) `.animate-sway` `.animate-tear-drip`

### 색 토큰 (직접 쓸 때만)

```
배경:   #060612
보라:   #7c3aed / violet-500   (부산대 컬러)
핑크:   #be185d
앰버:   #d97706
강조 텍스트: rose-400, amber-200, emerald-400 등 Tailwind 기본
회색 단계: text-gray-300/400/500/600 (다크 위 본문/보조/캡션 순)
```

### 레이아웃 골격 (모든 페이지 동일)

```tsx
<main className="min-h-screen px-5 pb-10">
  <div className="max-w-md mx-auto pt-6">
    <header className="mb-6 flex items-center gap-3">
      <Link href="..." className="p-2 glass rounded-xl"><ChevronLeft size={18} /></Link>
      <div>
        <h1 className="text-xl font-black">제목</h1>
        <p className="text-xs text-gray-500 mt-0.5">부제</p>
      </div>
    </header>
    {/* glass-card 섹션들 */}
  </div>
</main>
```

> 둥근 모서리는 `rounded-2xl`(버튼/작은 박스) / `rounded-3xl`(큰 카드). 간격은 `gap-3`, `mb-4`, `p-5~6` 위주. 폰트 굵기 `font-black`(제목)/`font-bold`(소제목).

---

## 5. API route 레이어 (실측 32개)

전부 `app/api/.../route.ts`. 명명 = REST 경로, 내부는 RPC 호출. 주요 매핑:

| route | 메소드 | 호출 RPC |
|---|---|---|
| `/api/match-pool/enter` | POST | `enter_match_pool` ← **데일리카드 강제입력 게이트 붙는 곳** |
| `/api/match-pool/stats` | GET | `get_match_pool_stats` (lib/match-pool-stats 가공) |
| `/api/matches` | GET | `get_my_matches` |
| `/api/matches/[id]` | GET | `get_match_detail` |
| `/api/matches/[id]/confirm` | POST | `confirm_match` ← **추첨 트리거 붙는 곳** |
| `/api/matches/[id]/continuation` | GET/POST | `get_match_continuation_state` / `submit_continuation_choice` |
| `/api/matches/[id]/refund` | POST | `submit_refund_request` |
| `/api/matches/[id]/checkin` | POST | GPS 체크인 |
| `/api/matches/[id]/review` | GET/POST | 만남 평가 |
| `/api/notifications` 외 | GET/POST | 알림 |
| `/api/deposits`, `/api/groups`, `/api/friend-requests/*` | … | 그룹/보증금/친구 |

### route 표준 템플릿 (continuation/route.ts 실측 기반)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('rpc_function_name', { p_match_id: params.id })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  return NextResponse.json({ state: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  // …입력 검증…
  const { data, error } = await supabase.rpc('rpc_action', { p_match_id: params.id, /*...*/ }).maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'submit_failed' }, { status: 400 })
  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}
```

**규칙**: ① 첫 줄은 항상 auth 가드. ② DB는 `supabase.rpc()`만. ③ 에러는 `{ error: 코드 }` + 4xx. ④ params는 Next 14 동기 시그니처 `{ params }: { params: { id: string } }`.

---

## 6. ★ 데일리카드 화면 추가 — 복붙 템플릿

데일리카드는 매칭 상세(`app/match/[id]/page.tsx`) 안 **카드 캐러셀 영역** + 신규 route 몇 개. 아래 클라이언트 페이지 템플릿이 `continuation/page.tsx` 실측 패턴과 동일하다. 이대로 만들면 기존과 톤이 맞는다.

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Lock, Loader2 } from 'lucide-react'

interface DailyCard {
  day_offset: number
  card_key: string
  revealed: boolean
  payload: Record<string, unknown> | null
}

export default function DailyCardsPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const [cards, setCards] = useState<DailyCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/daily-cards`)
      if (!res.ok) { setError('카드를 불러오지 못했어요.'); return }
      const data = await res.json() as { cards: DailyCard[] }
      setCards(data.cards ?? [])
    } finally { setLoading(false) }
  }, [matchId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href={`/match/${encodeURIComponent(matchId)}`} className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-black">오늘의 카드</h1>
            <p className="text-xs text-gray-500 mt-0.5">만남까지 매일 한 장씩 열려요</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중
          </section>
        ) : (
          <div className="space-y-3">
            {cards.map((c) => c.revealed ? (
              <section key={c.day_offset} className="glass-card rounded-3xl p-5">
                {/* card_key별 렌더링 (songs/food/movie/ideal/venue ...) */}
                <p className="text-sm font-bold">{c.card_key}</p>
              </section>
            ) : (
              <section key={c.day_offset} className="glass rounded-3xl p-5 text-center opacity-50">
                <Lock size={20} className="mx-auto mb-2 text-gray-500" />
                <p className="text-xs text-gray-500">D{c.day_offset} · 아직 잠긴 카드예요</p>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

> 잠긴 카드 = `.glass` + `opacity-50` + 자물쇠. 열린 카드 = `.glass-card`. 클라이맥스(D-1 이상형) = `.glass-rose` + `.gradient-fate-text` 권장.

---

## 7. 공용 타입 (`lib/types.ts`) — 수정 시 PR+성준 리뷰 필수

이미 정의된 것 중 데일리카드가 쓸 것:

```ts
type Gender = 'male' | 'female'
type AppearanceType = 'cute' | 'pure' | 'chic' | 'warm' | 'stylish' | 'healthy'

// D-1 이상형 카드가 재활용 (raw vector 노출 금지, bucket_weights만 노출 가능)
interface PreferredAppearance {
  preferred_bucket_weights: Record<string, number> | null   // ← D-1 카드 데이터
  // …나머지 vector들은 전부 비노출…
}
interface PreferredPersonality {
  preferred_personality_primary_type: string | null
  preferred_personality_secondary_type: string | null
}
```

> 데일리카드용 새 타입(`DailyCard`, `CoopActivity` 등)을 추가하려면 `lib/types.ts` 수정 = **PR 열고 충현/성준 상호 리뷰**. CLAUDE.md 절대규칙.

---

## 8. 기존 화면 동작 참고 (데일리카드 톤 맞추기용)

가장 비슷한 레퍼런스 2개 — 그대로 읽고 흉내 내면 됨:

- `app/match/[id]/continuation/page.tsx` — fetch→상태분기→glass-card 렌더, `translateError()` 코드→한국어 매핑 패턴. **데일리카드 페이지 골격 그대로 차용.**
- `app/match/[id]/refund/page.tsx` + `components/SanjiCharacter.tsx` — 다단계 모달/감성 카피/마스코트. 협동 활동(밸런스 게임 결과 연출)에 참고.

### 카피 톤 (실측)

- 친근체: "~했어요", "~할까요?", 이모지 적극(💜 🥺 →).
- 캡션은 `text-[11px] text-gray-500 leading-relaxed`.
- 강조 한 줄은 `gradient-fate-text` + `font-black`.

---

## 9. 절대 규칙 (CLAUDE.md, 프론트 관련)

1. `lib/types.ts` 수정 → **PR + 상호 리뷰 필수**
2. `lib/supabase.ts` / `lib/supabase-server.ts` 수정 → 상대방 알림 (공용)
3. 컴포넌트에서 DB 직접 접근 금지 → 반드시 route → RPC
4. `appearance_score_raw`, `score_breakdown`, raw preferred vector 등 **내부값 사용자 노출 금지** (데일리카드 D-1은 `preferred_bucket_weights`만)
5. 디자인 = 기존 글래스 유틸 클래스 조합. 임의 색/그림자 신설 자제
6. `app/debug/sanji/` 는 출시 전 삭제 대상

---

## 10. 데일리카드 착수 순서 (이 문서 + 경계 합의서 연계)

1. 이 문서로 **프론트 컨벤션 숙지** (§3 흐름, §4 디자인, §5 route 템플릿)
2. `SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md` §7 **3문항 회신** (match_meetings 확정 시점 등)
3. `docs/product/matching/DAILY_CARD_SPEC_2026-05-28.md` — 카드 종류/협동 활동 상세
4. 충현이 z50 마이그 + RPC 작성 → 성준은 §6 템플릿으로 화면 구현
5. `npm run typecheck` + `npm run build` PASS 확인 후 PR

---

## 11. 참조 문서 지도

| 문서 | 내용 |
|---|---|
| **이 문서** | 프론트 전체 구조·컨벤션·디자인·템플릿 |
| `SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md` | 데일리카드가 성준 매칭 흐름과 만나는 3접점 합의 |
| `docs/product/matching/DAILY_CARD_SPEC_2026-05-28.md` | 데일리카드 기능 전체 설계 |
| `docs/CODEX_MASTER_2026-05-23.md` | 프로젝트 마스터 (DB모델 §8, bypass guard §10, E2E §6) |
| `docs/engineering/INTERFACE_CONTRACT.md` | 충현/성준 영역 경계 |
| `app/globals.css` | 디자인 시스템 원본 (클래스 정의) |

---

*프론트엔드 공유 문서. 코드와 불일치 시 코드가 진실 — 이 문서 갱신.*
