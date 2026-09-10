# 지도 중심 팀 초대 · 구현 계약

최신 사용자 지시: LoL 미니맵과 축구 전술판에서 특정 빈자리를 눌러 그 자리에 친구를 초대한다. 구 목록형 개설 화면을 새 흐름의 대안으로 보여주지 않는다.

## 완료 기준

1. 팀 개설자는 지도에서 자신의 자리와 실력을 정하고 팀을 만든다. 지도 빈자리를 누르면 해당 자리의 친구 선택 패널이 열린다.
2. 같은 학교·학과의 수락된 앱 친구를 초대한다. 초대 중인 자리는 대기 상태로 보이며 확정 인원에 포함하지 않는다.
3. 수신자는 앱 알림/리그 받은 초대에서 팀·종목·초대 포지션을 확인한다. 같은 지도에서 자기 티어·실력을 선택하고 수락 또는 거절한다. 주장이 이미 초대한 친구에게 중복 주장 승인을 요구하지 않는다.
4. 서버는 수신자 본인, 현재 주장, 친구 관계, 학과·학교, 제재·차단, 정원, 빈자리, 만료·취소, 최신 revision을 확인한다. 프로필과 참가 확정·초대 갱신을 원자적으로 저장한다.
5. LoL·풋살 6명·정식 축구 11명의 기존 고정 포지션 지도를 사용한다. 종목·정원 변경으로 유효하지 않게 된 초대를 잘못 수락하지 않는다. 자유 드래그·전술 선택기는 이번에 구현한 범위가 아니다.
6. 처음 개설하는 시점부터 초대 송신/수신 시점을 전환하는 클릭 리허설을 제공한다. 예시임을 표시하고 실제 요청/푸시를 보내지 않는다.
7. 새 기본 경로와 과거 legacy 링크도 지도 중심 여정으로 연결한다. 기존 대기 팀·상대 제안·채팅·순위 기능은 유지한다.

## 작업 경계

- 기존 격리 작업공간 `main-web-scope-20260908`, base HEAD `a2a5cd493ef2356e7ec7aa2d17b11f0650d419bc`의 미커밋 작업을 보존하며 이어간다.
- UI 담당: Journey, 지도 초대 패널, 클릭 리허설, UI/상태 테스트.
- 서버 담당: 새 초대 계약·API·forward migration, 실제 SQL 로컬 통합 테스트.
- 부모 담당: 알림 제목/본문/안전한 딥링크, 페이지 진입, 통합 검증·캡처·독립 검토.
- 별도 원격 DB 적용, 실제 초대·푸시 전송, commit/stage/push/deploy는 하지 않는다. 휴대폰 푸시 전달 증거와 DB 앱 알림 저장 증거를 혼동하지 않는다.

## 검증

- 실패 재현: 기존 초대 수락의 `invalid_slot_profile`; 새 흐름의 정상 수락과 비교한다.
- 거절/취소/만료, 자리 충돌, 다른 수신자, 비주장·다른 학교/학과·차단, 중복 요청을 로컬 PGlite로 검사한다.
- 알림 딥링크는 허용된 종목·UUID만 조합한다. 외부/임의 href를 신뢰하지 않는다.
- 로컬 브라우저에서 송신 → 수신 알림 → 초대 지도 → 수락 → 인원 변화 및 취소/거절, LoL/풋살/축구를 확인한다. 모바일/데스크톱 캡처를 남긴다.
- 범위 TypeScript·lint·회귀 검사와 독립 검토 후 실제 검증 범위만 보고한다.

## 구현 결과

- 송신: 지도에서 자신의 자리·실력을 선택하여 1명으로 개설 → 빈 포지션 클릭 → 해당 자리의 친구 검색·선택 → 지도에 `초대 중` 표시. 수락 전에는 확정 인원을 올리지 않는다.
- 수신: 앱 알림 또는 리그 받은 초대 → 초대 카드 → 같은 팀 지도에서 초대 자리 확인 → 자기 티어·실력 선택 → 수락 또는 거절. 주장이 보낸 초대를 수락한 친구에게 다시 주장 승인을 요구하지 않는다.
- 실제 데이터 경로: `/api/community/department/league/invites` → 인증된 RPC. 새 forward migration에 자리·친구·학교/학과·권한·정원·revision·만료 검사를 포함했다. 기존 알림 조회 권한을 유지하고 초대·알림을 같은 트랜잭션에 저장한다.
- `legacy=1` 링크도 새 지도 여정으로 연결한다. 구 목록형 개설 화면을 대체 경로로 노출하지 않는다.

## 브라우저 확인

로컬 개발 서버의 명시적 예시 계정 리허설에서 직접 클릭했다. 실계정 참여 증거가 아니다.

| 환경 | 확인한 흐름 | 결과 |
| --- | --- | --- |
| 모바일 390×844, LoL | MID·골드로 개설 → TOP 라임 초대 → 받은 알림 → TOP·에메랄드 수락 → 주장 지도 복귀 | 1/5 → 대기 중 1/5 → 수락 후 2/5 |
| 모바일, LoL | JUNGLE 모카 초대 → 지도에서 초대 취소 | 자리 비워짐, 확정 인원 유지 |
| 모바일, 풋살 | GK 개설 → ST 모카 초대 → 받은 카드 → 거절 | 수락되지 않으며 1/6 유지 |
| 모바일, 축구 | CM 개설 → LW 라임 초대 → 자기 실력 선택·수락 | 1/11 → 2/11, 11개 지도 버튼 간 겹침 없음 |
| 데스크톱 1440×1000 | LW 지도 자리 → 친구 선택 창 → 수신 거절 | 검색·선택 창 표시, 최종 수정 후 종료된 초대의 지도·인원 숨김 |
| 모바일, 다중 팀 리허설 | 첫 팀 MID 골드, 둘째 팀 TOP 브론즈 → 첫 팀만 다이아몬드로 저장 | 첫 팀 MID 다이아몬드 700점, 둘째 팀 TOP 브론즈 200점 유지 |
| 기존 링크 | `/community/department?legacy=1` | 새 종목 선택·지도 여정으로 연결. 실제 API 미연결은 오류로 표시하며 예시 데이터로 대체하지 않음 |

### 실제 화면 캡처

캡처 디렉터리: `artifacts/qa/20260910-position-map-invites/`

- `lol-choose-friend-mobile.png`: 지도에서 TOP 선택 후 친구 고르기
- `lol-map-pending-mobile.png`: TOP 초대 중, 확정 1/5
- `received-notification-mobile.png`: 받은 초대 카드
- `lol-receiver-map-mobile.png`: 받은 TOP 자리와 자기 티어 입력
- `lol-accepted-mobile.png`: TOP 수락 후 2/5
- `football-map-pending-mobile.png`: 축구 11자리와 LW 초대 중
- `football-receiver-map-mobile.png`: 축구 수신 지도·자기 실력 입력
- `football-friend-picker-desktop.png`: 데스크톱 지도 위 친구 선택 창
- `football-declined-desktop.png`: 거절 후 현재 팀 지도 노출하지 않음

## 발견 후 수정한 문제

1. 구 수락 RPC가 자리·티어 없이 새 초대를 수락할 수 있던 경로를 독립 검토에서 재현했다. 새 자리 초대는 이 구 경로에서 거절하고, 자리 없는 레거시 초대의 기존 동작은 보존했다.
2. 모바일 수신 화면의 중복 안내를 줄이고 받은 알림 카드 → 지도 순서를 복구했다.
3. 거절·취소·만료 뒤 데모에 현재 팀 지도가 남던 문제를 수정했다. 수락한 참가자는 자기 팀을 계속 볼 수 있다.
4. 예시 초대의 만료 기간을 서버와 같은 7일로 맞추고 연속 팀 생성 시 ID 충돌을 막았다.
5. 여러 예시 팀 중 선택한 팀이 아닌 최신 팀의 정보를 바꾸던 데모 오류를 수정했다. 선택 팀 ID를 명시적으로 전달하고 팀별 주장 위임·대전 제안 상태를 분리했다.

## 최종 로컬 검사

- 최종 고정 소스의 12개 테스트 파일 통합 실행: **70/70 통과**, exit 0, 41.8초. 초대 계약·실제 PGlite SQL·알림·데모·UI 연결·기존 리그/채팅/투표·리허설 경계·하단 탭 회귀를 포함한다.
- 새 초대 계약/SQL 묶음은 위 통합 검사에 포함되며 **15/15**다. 중복해서 70개에 더하지 않는다.
- 전체 `tsc --noEmit --incremental false`: exit 0.
- 변경 범위 lint: 진단 오류·경고 0. 기존 ESLint 설정 형식의 폐기 예정 경고와 Node 모듈 형식 경고는 도구 설정 경고이며 이번 범위 밖 설정을 바꾸지 않았다.
- 기존 tracked 부모 변경 `git diff --check`: exit 0. 최종 branch `codex/main-web-scope-20260908`, HEAD `a2a5cd493ef2356e7ec7aa2d17b11f0650d419bc` 유지, staged 없음.
- 독립 검토: **LOCAL PASS**. 최종 17개 소스 해시 일치 확인, 독립 API·SQL·알림 21/21 및 데모·UI 21/21 통과. 구 수락 우회·종료 지도 노출·다중 팀 교차 변경의 P2 세 건을 수정 후 재검토했으며, 검토 범위 내 미해결 actionable P0/P1/P2는 없다. 운영 보안 보증이나 원격 출시 승인을 뜻하지 않는다.

통합 검사 명령:

```text
node --test --test-concurrency=1 tests/meetups/league-invites.test.mjs tests/meetups/league-invites-sql.test.mjs tests/meetups/league-invites-demo.test.mjs tests/meetups/league-invites-ui.test.mjs tests/meetups/league-invite-notifications.test.mjs tests/meetups/challenge-journey.test.mjs tests/meetups/challenge-journey-ui.test.mjs tests/meetups/challenge-journey-demo.test.mjs tests/meetups/challenge-journey-sql.test.mjs tests/meetups/league-lobby-sql.test.mjs tests/meetups/guided-rehearsal-boundary.test.mjs tests/tooling/app-tab-sections.test.mjs
```

## 증거 경계

- 검증 범위는 로컬 브라우저, 로컬 PGlite SQL, 타입·lint·회귀 검사다.
- 원격 migration 적용, 실계정 HTTP 초대·수락, 실기기 알림·푸시 전달은 미검증이다. 앱 내 알림 저장과 휴대폰 푸시는 다른 기능이며 실제 푸시 코드를 이번에 추가하지 않았다.
- 자유 드래그·축구 전술 선택 기능을 이번 완료 범위로 주장하지 않는다. 현재는 기존 고정 포지션 지도 기준이다.
- stage·commit·push·배포·실제 초대는 실행하지 않았다. 원래 존재하던 미커밋 변경을 보존했다.
