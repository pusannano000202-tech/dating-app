# 팀 공통 컨텍스트

최신 기준: 2026-06-15

## 제품 한 줄 설명

부산대 학생이 친구와 2명 또는 3명 그룹을 만들고, 상대 그룹과 자동 매칭된 뒤, 만남 전까지 하루에 하나씩 두근거리는 정보를 열어보는 그룹 미팅 앱이다.

초기 제품은 사용자가 막힘없이 눌러볼 수 있는 로컬/베타 흐름을 우선한다.

## 현재 확정된 제품 결정

| 항목 | 결정 |
| --- | --- |
| 초기 배포 | 전면 무료 베타 |
| 결제/환불 | 사용자 화면에서는 뒤로 뺌. 기존 DB/API 잔재는 보존하되 메인 UX에 노출하지 않음 |
| 로그인 | 이메일 인증/OTP 방향. 로컬 preview는 로그인 없이 막힘없이 진입해야 함 |
| 매칭 비중 | 외모, 성격, 키, 체형 4개만 유지 |
| 학교/취미/시간대 가중치 | 현재 사용자 프로필 입력/판단 근거가 부족하므로 가중치에서 제외 |
| 데일리카드 | 16:00-20:00 사이 사용자가 직접 하루 한 장을 뽑는 방향 |
| 카드 작성 | 긴 textarea 1개가 아니라 항목별 카드 작성 UI 방향 |
| 음식 취향 | 부산대 맛집 3곳 선택 + 네이버지도 링크 방향 |
| 인터넷 논쟁 | 여러 질문을 A/B 이미지 카드로 선택하는 방향 |
| 장소/지도 | 1차 MVP는 `venues.map_url` 수동 네이버지도 링크. API/SDK는 이후 |
| production DB | 팀장방 승인 없이 접근/적용 금지 |

## 주요 로컬 진입 경로

```text
http://127.0.0.1:3003/dev/preview
```

| 경로 | 용도 |
| --- | --- |
| `/dev/preview` | 로그인 없이 주요 화면 확인 |
| `/` | 홈 |
| `/profile/basic` | 기본 정보 |
| `/profile/worldcup` | 이상형 월드컵 |
| `/profile/survey` | 성향 질문 |
| `/profile/personality-preference` | 상대 성향 선호 |
| `/profile/schedule` | 가능 시간 |
| `/profile/preferences` | 매칭 비중 |
| `/friends` | 친구 추가 |
| `/group/create` | 그룹 생성/초대 |
| `/group/create?from=home-queue` | 매칭 큐 진입 완료 화면 |
| `/match` | 매칭 목록 |
| `/match/dev-match-pending` | 매칭 확정 전 카드 작성 |
| `/match/dev-match-1` | 매칭 확정 후 데일리카드/채팅 |
| `/match/dev-match-1/chat` | 매칭 채팅 |

## 주요 코드 위치

| 영역 | 파일 |
| --- | --- |
| 로컬 preview | `app/dev/preview/page.tsx` |
| 홈 | `app/page.tsx`, `components/matching/ActiveMatchingHomeCard.tsx` |
| 그룹 생성 | `app/group/create/page.tsx`, `components/matching/group-create/*` |
| 큐 레이더 | `components/matching/QueueRadarCard.tsx` |
| 매칭 목록 | `app/match/page.tsx` |
| 매칭 상세 | `app/match/[id]/page.tsx` |
| 매칭 채팅 | `app/match/[id]/chat/page.tsx` |
| 데일리카드 작성 정의 | `lib/matching/daily-card-authoring.ts` |
| 데일리카드 API | `app/api/matches/[id]/daily-cards/route.ts` |
| 카드 저장 API | `app/api/matches/[id]/card/route.ts` |
| 장소/미팅 스키마 | `supabase/migrations/20260614125057_phase_5_meeting_schema_integration.sql` |

## 현재 주요 위험

- `app/match/[id]/page.tsx`가 너무 많은 책임을 갖고 있다.
- 데일리카드에는 `작성 카드`와 `하루 1장 공개 카드`가 섞여 보일 수 있다.
- 홈/매칭/알림 동선이 아직 앱처럼 묶이지 않았다.
- dev preview와 실제 인증 흐름이 섞이면 디자인 검토가 막힌다.
- 부산대 맛집/지도 기능은 DB 기반은 있으나 사용자 선택 UI와 seed 데이터가 부족하다.
- 일부 기존 문서와 화면 문구가 깨져 보일 수 있으므로 UI 작업 전 실제 화면 확인이 필요하다.

## 금지사항

- `main` 직접 push 금지
- worker 임의 커밋 금지
- production Supabase 직접 적용 금지
- `lib/types.ts` 수정 시 상대방 리뷰 없이 진행 금지
- `supabase/migrations/` 신규/수정은 팀장방 승인과 검증 계획 없이 진행 금지
- 같은 파일을 여러 worker에게 동시에 맡기기 금지
- 이미지 worker가 코드/문서/DB 수정 금지
- UX 감사 worker가 구현까지 진행 금지

## 검증 기준

작업 성격에 맞춰 아래 중 필요한 것을 선택한다.

```bash
npm run typecheck
npm run lint
npm run test:matching
npm run test:config
npm run test:auth
npm run test:profile
npm run build
```

프론트 작업은 가능한 경우 로컬 route 확인까지 포함한다.

```text
http://127.0.0.1:3003/dev/preview
http://127.0.0.1:3003/match/dev-match-pending
http://127.0.0.1:3003/match/dev-match-1
```
