# 부산대 과팅앱 — Codex 컨텍스트

## 프로젝트 한 줄 정의

부산대에서 시작하는 대학생 그룹미팅 매칭 앱.
사용자가 친구와 그룹을 만들고 보증금을 걸면, 시스템이 상대 그룹·시간·장소를 자동 확정하는 **프로필 비공개 자동확정 과팅 앱**.

## 팀 구성

- **충현** — 프로필/외모 평가 모듈 담당 (Codex 사용)
- **성준** — 그룹/매칭 엔진 담당 (Codex + Codex 사용)
- 기획 문서: `부산대_과팅앱_v1.2_정의서.md` (루트에 위치)

## 현재 운영 메모

이 문서는 원래 충현/성준 2인 협업 기준으로 작성되었다.
다만 2026-07-07 기준 사용자가 혼자 작업 중이라고 명시한 경우에는 **solo-owner 운영**을 적용한다.

- 사용자가 "main으로 올려", "main 직접 push", "Vercel 배포되게 올려"처럼 명확히 지시하면 Codex는 `main` 직접 push를 수행할 수 있다.
- 그 전에는 반드시 현재 브랜치, 최근 커밋, dirty 상태, 포함 파일, 보류 파일, 검증 결과, Vercel 자동 배포 영향을 보고한다.
- `supabase/migrations/`, `lib/types.ts`, `lib/supabase.ts`, DB/API 라우트는 solo-owner 운영에서도 위험 파일로 분리 보고한다.
- 사용자가 main 반영을 명확히 지시하지 않았으면 기존처럼 작업 브랜치 push 또는 PR 흐름을 기본값으로 둔다.

## 기술 스택

- Frontend: Next.js 14 (App Router)
- Auth: Supabase Auth (휴대폰 OTP)
- DB: Supabase Postgres
- Storage: Supabase Storage (사진)
- 외모 AI: Python + PyTorch (SCUT-FBP5500 + ResNet50)
- 매칭 엔진: Python + scipy (헝가리안 알고리즘)
- 결제: 토스페이먼츠 (테스트 결제 우선)
- 배포: Vercel (프론트) + Python 서버 (AI/매칭 분리)

## 디렉토리 구조

```
/
├── app/                    # Next.js App Router
│   ├── (auth)/             # 인증 관련 페이지
│   ├── profile/            # 프로필 입력 (충현 담당)
│   ├── group/              # 그룹 생성/초대 (성준 담당)
│   └── match/              # 매칭 결과/확정 (성준 담당)
├── components/
│   ├── profile/            # 프로필 관련 컴포넌트 (충현 담당)
│   └── matching/           # 매칭 관련 컴포넌트 (성준 담당)
├── lib/
│   ├── supabase.ts         # Supabase 클라이언트 (공용 — 수정 시 상대방 알림)
│   ├── types.ts            # 공용 타입 정의 (공용 — 수정 시 상대방 알림)
│   └── constants.ts        # 공용 상수 (공용 — 수정 시 상대방 알림)
├── python/
│   ├── appearance/         # 외모 AI 추론 서버 (충현 담당)
│   └── matching/           # 매칭 배치 엔진 (성준 담당)
├── supabase/
│   └── migrations/         # DB 마이그레이션 (변경 시 반드시 PR + 상대방 리뷰)
└── docs/
    ├── README.md                      # 문서 인덱스 (영역별 분류 규칙)
    └── engineering/
        ├── COLLABORATION.md           # 협업 규칙 (필독)
        └── INTERFACE_CONTRACT.md      # 모듈 간 인터페이스 계약 (필독)
```

## Codex가 작업 시작 전 반드시 읽어야 할 파일

1. `docs/engineering/INTERFACE_CONTRACT.md` — 두 모듈의 경계와 계약
2. `docs/engineering/COLLABORATION.md` — 브랜치 전략과 충돌 방지 규칙
3. `supabase/migrations/` — 현재 DB 스키마 상태

## 절대 규칙 (Codex 포함)

- `lib/types.ts` 수정 시 → 반드시 PR 열고 상대방 리뷰 받기
- `supabase/migrations/` 신규 파일 추가 시 → 상대방 확인 없이 main 머지 금지
- `main` 브랜치 직접 push는 팀 협업 모드에서는 금지. 단, solo-owner 운영에서 사용자가 명확히 지시하면 허용
- 인터페이스 계약(`docs/engineering/INTERFACE_CONTRACT.md`)에 정의된 타입/컬럼명 임의 변경 금지
