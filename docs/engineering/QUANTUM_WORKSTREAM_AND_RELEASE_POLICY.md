# Quantum 작업방/산출물/main 배포 운영 정책

작성일: 2026-07-07

이 문서는 Quantum 작업을 여러 Codex 방으로 나눠 진행할 때 코드, 디자인 산출물, DB/API 변경, main 배포가 서로 꼬이지 않게 하는 기준이다.

## 1. 작업방 역할

| 작업방 | 주 역할 | 수정 가능 기본 범위 | 직접 수정 금지 기본 범위 |
|---|---|---|---|
| 학교별 취향통계 방 | 조사, 통계 기획, 콘텐츠 설계 | `docs/research/`, `docs/handoff/active/`, `docs/plans/` | `app/`, `components/`, `lib/`, `supabase/` |
| 국내대학/디자인 방 | 마스코트, 색상, 화면 시안, 이미지 생성 | `docs/design-mockups/`, 외부 이미지 작업 폴더, handoff 문서 | 실제 앱 코드, DB/API, Vercel 배포 |
| 팀장방 | 실제 코드 반영, 검증, main 배포 | `app/`, `components/`, `lib/`, 선별 runtime asset, 테스트 | 조사/디자인 원본 대량 파일 무분별 커밋 |

원칙: 조사방과 디자인방은 많이 만들어도 된다. 팀장방은 그중 실제 앱에 필요한 파일만 선별해서 코드와 함께 반영한다.

## 2. 현재 확인된 문제

2026-07-07 기준 main 작업트리에서 확인된 untracked 산출물은 총 1126개였다.

| 영역 | 파일 수 | 기본 판단 | 이유 |
|---|---:|---|---|
| `docs/design-mockups/` | 620 | 보관/외부 아카이브, 기본 ignore | 캡처, PDF, HTML, 생성 스크립트, 후보 이미지가 섞인 대용량 디자인 작업물 |
| `public/university-mascots/app-assets-v2*` | 396 | 보관/외부 아카이브, 기본 ignore | 앱 최종 runtime 기준이 아닌 후보/초안 asset |
| `docs/handoff/active/` | 76 | 선별 커밋 후보 | 다른 방 인수인계와 최종 판단 근거가 될 수 있음 |
| `docs/plans/` | 3 | 선별 커밋 후보 | 활성 계획 문서 |
| `docs/research/` | 1 | 선별 커밋 후보 | 공식 조사 데이터일 수 있음 |
| `tmp/` | 30 | 삭제 또는 ignore | PDF 변환 중간 PNG 등 재생성 가능한 임시 파일 |

이 상태에서 `git add -A`를 하면 코드 배포와 무관한 디자인/임시 산출물이 함께 올라갈 수 있다. 이것이 현재 작업 구조의 가장 큰 위험이다.

## 3. 산출물 커밋 정책

| 분류 | 예시 | 처리 |
|---|---|---|
| 바로 커밋 가능 | 실제 코드, 테스트, 최종 handoff 문서, 최종 research JSON | 정확한 파일만 `git add` |
| 별도 검수 후 커밋 | `public/university-mascots/app-assets-v3-display/{schoolId}/{pose}.png` | 코드가 실제 참조하고, 7 pose 누락이 없고, 화면 QA가 끝난 경우만 |
| 보관/외부 아카이브 | contact sheet, PDF 캡처, Canva/ImageGen 원본, v2 draft asset | repo 기본 커밋 금지. 필요하면 OneDrive/output 또는 별도 release zip |
| 삭제 가능 | `tmp/`, 변환 중간 PNG, stale cache | 재생성 가능할 때만 삭제 |
| 위험 분리 | `supabase/migrations/`, DB/API 라우트, `lib/types.ts`, `lib/supabase.ts` | 프론트 커밋과 분리하고 main push 전 별도 보고 |

## 4. 마스코트/디자인 asset 규칙

앱이 실제 쓰는 asset만 `public/`에 둔다.

커밋 가능한 runtime 기준:

```text
public/university-mascots/app-assets-v3-display/{schoolId}/welcome.png
public/university-mascots/app-assets-v3-display/{schoolId}/guide.png
public/university-mascots/app-assets-v3-display/{schoolId}/waiting.png
public/university-mascots/app-assets-v3-display/{schoolId}/support.png
public/university-mascots/app-assets-v3-display/{schoolId}/confirm.png
public/university-mascots/app-assets-v3-display/{schoolId}/refund.png
public/university-mascots/app-assets-v3-display/{schoolId}/avatar.png
```

커밋 전 확인:

- `lib/university-theme.ts` 또는 관련 registry에서 해당 경로를 실제 참조하는가?
- 각 학교가 7개 pose를 모두 갖는가?
- 360/390/430/desktop 화면에서 캐릭터가 잘리지 않는가?
- 공식 로고/마스코트 원본 복제나 IP 리스크가 없는가?
- CTA, 입력창, 하단 탭을 가리지 않는가?

후보 asset, contact sheet, 중간 이미지, PDF 캡처는 `docs/design-mockups/` 또는 외부 보관 위치에 둔다. 이 폴더는 기본적으로 `.gitignore` 대상이다.

## 5. DB/API 변경 분리 규칙

프론트 배포와 DB/API 변경은 같은 커밋에 섞지 않는다.

위험 파일:

- `supabase/migrations/**`
- `app/api/**`
- `lib/types.ts`
- `lib/supabase.ts`
- 인증, 결제, 알림, 매칭 확정, 환불과 연결된 공용 계약 파일

main push 전 보고에 반드시 포함할 내용:

- 어떤 테이블/RPC/정책이 바뀌는가?
- 기존 배포 코드와 새 DB가 동시에 동작 가능한가?
- migration 적용 전후 순서 문제가 없는가?
- rollback이 가능한가?
- 로컬 테스트만 통과했는지, 실제 Supabase 적용 검증도 했는지?

## 6. main 배포 방식

작은 수정은 main에서 바로 작업해도 된다.

```bash
git switch main
git pull origin main
git status --short --branch
# 수정
git add 정확한파일만
git commit -m "..."
git push origin main
```

큰 작업이나 실험은 브랜치에서 한다.

```bash
git switch -c codex/작업명 main
# 수정, 검증, 커밋
git switch main
git pull origin main
git merge codex/작업명
npm run typecheck
npm run lint
git push origin main
```

브랜치 일부만 배포할 때는 필요한 커밋만 main에 올린다.

```bash
git switch main
git pull origin main
git cherry-pick 필요한커밋해시
npm run typecheck
npm run lint
git push origin main
```

## 7. main push 전 보고 양식

팀장방은 main push 전에 아래 형식으로 보고한다.

```text
[main push 전 보고]

1. 현재 브랜치
- 예: main

2. main과 origin/main 차이
- 예: main == origin/main
- 예: main이 origin/main보다 1커밋 앞섬
- 예: main이 origin/main보다 뒤처짐, pull 필요

3. 포함 파일
- 이번 커밋/배포에 들어갈 파일 목록

4. 보류 파일
- untracked 문서, 디자인 원본, 대용량 asset, 실험 브랜치 파일

5. DB/API 위험 파일 여부
- 없음 / 있음
- 있으면 파일별 위험과 적용 순서 설명

6. 테스트 결과
- npm run typecheck
- npm run lint
- 필요한 테스트 script
- 브라우저 실제 화면 확인 결과

7. Vercel 자동 배포 영향
- main push 시 자동 배포 예상
- 배포 후 확인할 URL/화면
```

## 8. 하지 말 것

- `git add -A`로 전체를 한 번에 stage하지 않는다.
- 디자인방 산출물 전체를 코드 커밋에 섞지 않는다.
- `public/`에 있다는 이유만으로 모든 이미지를 runtime asset으로 취급하지 않는다.
- migration과 프론트 UI를 한 커밋에 섞지 않는다.
- main push 전 `main...origin/main` 상태를 생략하지 않는다.
- Vercel 배포 여부를 로컬 테스트 통과만으로 확정하지 않는다.

## 9. 이 정책을 적용한 현재 조치

- `docs/design-mockups/`는 기본 ignore 처리한다.
- `tmp/`는 기본 ignore 처리한다.
- `public/university-mascots/app-assets-v2*`는 후보/초안 asset으로 보고 기본 ignore 처리한다.
- `docs/handoff/active/`, `docs/plans/`, `docs/research/`는 ignore하지 않고 선별 커밋 후보로 남긴다.
- 실제 앱 runtime asset은 `app-assets-v3-display` 같은 최종 폴더만 선별 커밋 대상으로 둔다.
