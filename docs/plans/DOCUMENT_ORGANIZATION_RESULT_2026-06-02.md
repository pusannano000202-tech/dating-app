# 문서 정리 결과 보고서 (Codex용)

> **실행일**: 2026-06-02 · 실행자: 충현 (Claude Code 세션)
> **대상**: Codex (성준) — 새 문서 구조와 규칙을 이 파일 하나로 파악
> **계획 원본**: `DOCUMENT_ORGANIZATION_PLAN.md` (같은 폴더)
> **상태**: ✅ 완료. 아래는 *계획이 아니라 실제 결과*다.

---

## 0. 30초 요약 (Codex가 알아야 할 것)

- `docs/` 의 흩어진 `.md` 들을 **제품 영역별 폴더**로 재배치했다.
- **파일명은 그대로**, 폴더만 이동했다 (검색·링크 안정성 위해 리네임 안 함).
- **3개 커밋**으로 단계 분리: 폴더 생성 → 이동 → 링크 수정.
- `archive/`·`handoff/archive/`·적용된 `.sql` 마이그는 **동결**(수정 안 함).
- 새 문서를 추가할 땐 §3 분류 규칙을 따른다. 진입점은 항상 `docs/README.md`.

---

## 1. 커밋 내역

| 커밋 | 단계 | 내용 |
|---|---|---|
| `88a721a` | 1/3 | 폴더 구조 + 인덱스 README 11개 생성 |
| `249f2ac` | 2/3 | 문서 35개를 영역별 폴더로 `git mv` (파일명 유지) |
| `1211b4a` | 3/3 | 옛 경로 참조 링크 수정 (활성 파일만) |

브랜치: `profile/post-worldcup-decisions-2026-05-21` (main 직접 push 안 함, 아직 push 안 됨).
`git log --follow <파일>` 로 이동 전 히스토리 추적 가능 (git이 rename 감지).

---

## 2. 최종 폴더 구조 (실제)

```text
docs/
├── README.md                         # ★ 문서 인덱스 = 첫 진입점
├── CODEX_MASTER_2026-05-23.md        # (루트 잔류) 프로젝트 마스터 source of truth
├── PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md  # (루트 잔류) v2 확장 계획
├── SUNGJUN_MEETING_AGENDA_2026-06-01.md      # (루트 잔류) 회의 안건
│
├── plans/                            # 계획 허브 (현재/활성)
│   ├── README.md
│   ├── ACTIVE_PLAN_INDEX.md
│   ├── CURRENT_IMPLEMENTATION_STATUS.md
│   ├── DOCUMENT_ORGANIZATION_PLAN.md
│   ├── DOCUMENT_ORGANIZATION_RESULT_2026-06-02.md   # ← 이 문서
│   └── 2026-06-02-pre-meeting-excitement-info-plan.md
│
├── product/
│   ├── matching/                     # 매칭·과팅·보증금·데일리카드
│   │   ├── MATCHING_SYSTEM_PLAN.md
│   │   ├── DAILY_CARD_SPEC_2026-05-28.md
│   │   ├── 2026-06-02-proposed-match-card-deposit-flow.md
│   │   ├── 2026-06-02-card-deposit-flow-implementation-plan.md
│   │   └── SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md
│   ├── profile-worldcup/             # 이상형 월드컵·외모/성격 벡터
│   │   ├── IDEAL_WORLDCUP_64_DESIGN.md
│   │   ├── IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md
│   │   ├── APPEARANCE_ANALYSIS_SCHEMA.md
│   │   ├── APPEARANCE_ANALYSIS_GPT_PROMPT.md
│   │   ├── APPEARANCE_VECTOR_CALIBRATION.md
│   │   └── image-metadata/           # 남/여 이미지 카탈로그
│   │       ├── MALE_IMAGES_METADATA_MI01_MI96.md
│   │       ├── MALE_IDEAL_WORLDCUP_96_IMAGE_CATALOG_2026-05-22.md
│   │       └── NEW_IMAGES_METADATA_FI81_FI104.md
│   ├── social/                       # 친구·초대 (현재 README만, 예약 폴더)
│   └── operations/                   # 운영자·환불·마이그 검증
│       ├── ADMIN_OPERATIONS_PLAN.md
│       └── MIGRATION_VERIFY_REPORT_2026-05-22.md
│
├── engineering/                      # 계약·협업·코드리뷰
│   ├── INTERFACE_CONTRACT.md
│   ├── COLLABORATION.md
│   └── CODE_REVIEW_2026-05-21.md
│
├── handoff/
│   ├── active/                       # 아직 유효한 인수서
│   │   ├── SUNGJUN_FRONTEND_HANDOFF_2026-06-01.md
│   │   ├── SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md
│   │   └── ADMIN_APPEARANCE_SCORE_OVERRIDE.md
│   └── archive/                      # 과거 에이전트 덤프 (동결)
│       ├── CHUNGHYUN_SESSION_STATE.md
│       ├── CLAUDE_CODEX_BRIDGE.md
│       ├── CLAUDE_IDEAL_WORLDCUP_MEASURED_VECTOR_PROMPT.md
│       ├── CLAUDE_TO_CODEX_HANDOFF_2026-05-22.md
│       ├── CLAUDE_TO_CODEX_HANDOFF_2026-05-22_LATE.md
│       ├── CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md
│       ├── CODEX_HANDOFF_PHOTOS.md
│       ├── CODEX_PROMPT_CHUNGHYUN.md
│       ├── CODEX_TO_CLAUDE_HANDOFF_2026-05-22.md
│       ├── MALE_IDEAL_WORLDCUP_MI01_MI96_CODEX_REVIEW_2026-05-22.md
│       ├── MANUS_FEMALE_64_IMAGE_GENERATION_HANDOFF.md
│       ├── MANUS_FEMALE_GAP_FILL_AFTER_VECTOR_ANALYSIS.md
│       ├── MANUS_MALE_64_HANDOFF.md
│       └── male-ideal-review-assets/   # 리뷰용 이미지 8장
│
├── archive/                          # 옛 스냅샷 (동결, 갱신 안 함)
│   ├── 2026-05/
│   │   ├── CLAUDE_FULL_UNDERSTANDING_2026-05-21.md
│   │   ├── CODEX_FULL_UNDERSTANDING_2026-05-21.md
│   │   ├── CODEX_REPORT_2026-05-21_PM.md
│   │   ├── PROJECT_OVERVIEW_2026-05-22.md
│   │   ├── SESSION_PROGRESS_2026-05-22.md
│   │   ├── STATUS_2026-05-22.md
│   │   └── UNDERSTANDING_REVIEW_ROOM_2026-05-21.md
│   └── old-master-plans/
│       ├── MASTER_PLAN_V1_6_2026-05-21.md
│       └── PLAN_2026-05-22_FINAL.md
│
└── delete-candidates/                # 삭제 후보 격리 (현재 0건, README만)
```

각 폴더에는 그 폴더 내용을 설명하는 `README.md` 가 있다.

---

## 3. 분류 규칙 (새 문서는 이 표에 따라 배치)

| 주제 | 폴더 |
|---|---|
| 매칭·과팅·보증금·카드·데일리카드·만남 라이프사이클 | `product/matching/` |
| 이상형 월드컵·외모/성격 벡터·이미지 메타데이터·외모 분석 | `product/profile-worldcup/` (이미지 메타는 `image-metadata/`) |
| 친구·친구요청·그룹 초대·초대 링크 | `product/social/` |
| 운영자·환불·노쇼·마이그 검증·운영 정책 | `product/operations/` |
| 인터페이스 계약·협업 규칙·코드 리뷰 | `engineering/` |
| 인수인계 (유효) | `handoff/active/` |
| 인수인계 (과거 덤프) | `handoff/archive/` |
| 계획·진행상황·의사결정 | `plans/` |
| 날짜 박힌 옛 스냅샷·구 마스터플랜 | `archive/` |
| 폐기 의심 (즉시삭제 금지, 격리) | `delete-candidates/` |

---

## 4. 옛 경로 → 새 경로 매핑 (Codex가 옛 링크 만났을 때)

> 규칙: `docs/<FILE>` 형태 옛 참조를 만나면 아래로 치환.

| 옛 경로 | 새 경로 |
|---|---|
| `docs/MATCHING_SYSTEM_PLAN.md` | `docs/product/matching/MATCHING_SYSTEM_PLAN.md` |
| `docs/DAILY_CARD_SPEC_2026-05-28.md` | `docs/product/matching/DAILY_CARD_SPEC_2026-05-28.md` |
| `docs/handoff/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md` | `docs/product/matching/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md` |
| `docs/plans/2026-06-02-*-flow*.md` | `docs/product/matching/2026-06-02-*-flow*.md` |
| `docs/IDEAL_WORLDCUP_*.md` | `docs/product/profile-worldcup/…` |
| `docs/APPEARANCE_ANALYSIS_*.md`, `docs/APPEARANCE_VECTOR_CALIBRATION.md` | `docs/product/profile-worldcup/…` |
| `docs/MALE_IMAGES_METADATA_*`, `docs/MALE_IDEAL_WORLDCUP_96_*`, `docs/NEW_IMAGES_METADATA_*` | `docs/product/profile-worldcup/image-metadata/…` |
| `docs/ADMIN_OPERATIONS_PLAN.md`, `docs/MIGRATION_VERIFY_REPORT_2026-05-22.md` | `docs/product/operations/…` |
| `docs/INTERFACE_CONTRACT.md`, `docs/COLLABORATION.md`, `docs/CODE_REVIEW_2026-05-21.md` | `docs/engineering/…` |
| `docs/handoff/SUNGJUN_FRONTEND_HANDOFF_*`, `…SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md`, `…ADMIN_APPEARANCE_SCORE_OVERRIDE.md` | `docs/handoff/active/…` |
| 그 외 `docs/handoff/*` (CLAUDE/CODEX/MANUS 덤프, MALE_IDEAL_WORLDCUP_MI01_MI96_CODEX_REVIEW) | `docs/handoff/archive/…` |
| `docs/{CLAUDE,CODEX}_FULL_UNDERSTANDING_*`, `…REPORT…`, `…UNDERSTANDING_REVIEW_ROOM…`, `PROJECT_OVERVIEW_2026-05-22`, `SESSION_PROGRESS_2026-05-22`, `STATUS_2026-05-22` | `docs/archive/2026-05/…` |
| `docs/MASTER_PLAN_V1_6_2026-05-21.md`, `docs/PLAN_2026-05-22_FINAL.md` | `docs/archive/old-master-plans/…` |

**이동 안 한(루트 잔류) 파일** — 경로 그대로:
`docs/CODEX_MASTER_2026-05-23.md`, `docs/PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md`, `docs/SUNGJUN_MEETING_AGENDA_2026-06-01.md`, `docs/README.md`.

---

## 5. 갱신한 참조 (3/3 커밋에서)

이동에 맞춰 **활성 파일**의 옛 경로 링크를 고쳤다:

- `CLAUDE.md` (필독 파일 경로 + 디렉토리 트리)
- `docs/CODEX_MASTER_2026-05-23.md`
- `docs/PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md`
- `docs/plans/ACTIVE_PLAN_INDEX.md`, `docs/plans/README.md`
- `docs/handoff/active/SUNGJUN_FRONTEND_HANDOFF_2026-06-01.md`
- `docs/product/matching/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md`
- `부산대_과팅앱_v1.3_정의서.md`
- 코드 주석: `lib/matching/config.ts`, `lib/appearance/preference.ts`, `lib/appearance/vector.ts`
- 데이터: `public/appearance-ideal/METADATA.json` (`_meta` 문서 경로)

**일부러 안 고친 것 (동결 원칙)**:
- `docs/archive/**`, `docs/handoff/archive/**` — 과거 기록, 당시 경로 그대로 보존
- `supabase/migrations/*.sql` — 이미 적용된 마이그, 주석이라도 불변 유지
- `docs/plans/DOCUMENT_ORGANIZATION_PLAN.md` — "어디서 어디로 옮길지" 설명이라 옛 경로가 의도된 내용

검증: `npm run typecheck` ✅ PASS, `METADATA.json` JSON 유효성 ✅.

---

## 6. Codex가 앞으로 지킬 것

1. **새 문서는 §3 표로 배치**, 폴더 `README.md` 에 한 줄 추가.
2. **문서 링크는 새 경로로** 작성 (§4 매핑 참조).
3. `archive/`·`handoff/archive/` 는 **갱신하지 않는다** (히스토리 동결).
4. 폐기하고 싶은 문서는 **삭제 말고** `delete-candidates/` 로 옮기고 사유 기록 → 다음 검토 주기에 삭제.
5. 최신 진실의 출처는 `docs/CODEX_MASTER_2026-05-23.md` 와 `docs/plans/`. 불일치 시 코드가 우선.

---

*이 문서는 정리 "결과"의 스냅샷이다. 이후 구조가 또 바뀌면 `docs/README.md` 를 진실로 삼고 이 파일을 갱신할 것.*
