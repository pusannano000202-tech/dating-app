# 2026-08-18 작업 폴더 검증 및 배포 준비 대장

## 현재 판정

- 브랜치: `codex/quantum-handphone`
- 검증 기준 기능 HEAD: `65af2a52`
- 원격 브랜치 대비 로컬 커밋: 23개(이번 검증표 갱신 커밋 전 기준)
- 문서 작성 시 기존 작업 폴더 잔여 상태: 추적 수정 49개, 미추적 8,542개
- 이번 출시 후보 기능은 기능·보안·테스트·문서 단위로 분리 커밋함
- push, Vercel 배포, 원격 Supabase migration 적용: 수행하지 않음
- 로컬 배포 후보: 통과
- 운영 출시: 외부 환경과 실제 다중 계정 검증이 남아 있어 미검증

## 분리한 커밋

| 묶음 | 커밋 |
| --- | --- |
| Campus Eats 도메인·Elo·화면 | `ad639704`, `e046936a`, `c9abb952` |
| 커뮤니티 노출·소유권 계약 | `b129e970`, `2934115c` |
| 프로필·사진·외모 점수 | `b43d3b89` |
| 매칭·이벤트방·친구·모임 | `694eed56`, `a0460a09` |
| 인증·보안·DB 권한 회귀 | `cf04bd56`, `b41c24c6`, `1571d027` |
| 공통 UI·모바일 | `4c6a4eb8`, `3c79c0cc` |
| 배포·E2E·미리보기 검증 | `fcdf2ba1`, `29e56a31`, `ab954d70`, `42510b51`, `be6a96c1` |

## 깨끗한 체크아웃 독립 검증

검증 위치: `C:\Users\82108\AppData\Local\Temp\quantum-release-verify-20260818-ab954d70`

| 구분 | 결과 | 증거 |
| --- | --- | --- |
| 웹 타입 검사 | PASS | `npm run typecheck` |
| 인증 | PASS 18/18 | `npm run test:auth` |
| 프로필 | PASS 131/131 | `npm run test:profile` |
| 매칭·도메인 | PASS 410/410 | `npm run test:matching` |
| 설정·프론트 계약 | PASS 274/274 | `npm run test:config` |
| 웹 합계 | PASS 833 | 네 묶음 전체 통과 |
| 린트 | PASS | 오류·경고 0, 캐시 미사용 |
| 배포형 빌드 | PASS | Next.js 15.5.23, 경로 110개 생성 |
| 비밀정보 | PASS | 추적 파일 검사 0건 |
| 외모 분석 서버 | PASS 83, SKIP 17 | 실제 OpenAI 호출 0회 |
| 모바일 타입 검사 | PASS | Expo 앱 타입 검사 |
| 모바일 테스트 | PASS 153/153 | 전체 모바일 회귀 테스트 |
| Expo Doctor | PASS 21/21 | SDK 의존성 정합성 |
| 루트 의존성 감사 | PASS | 알려진 취약점 0건 |
| 운영형 경로 점검 | PASS 18/18 | 공개 200, 개발 전용 404, 보호 경로 307 |

## 원격 환경 읽기 전용 검증

대상 Supabase project ref: `jyfwcanjqwboyvicoafm` (`quantum-production`, `ACTIVE_HEALTHY`)

| 구분 | 결과 | 판정 |
| --- | --- | --- |
| 프로젝트 일치 | PASS | 로컬 ref와 원격 대상이 정확히 일치함 |
| migration 정합성 | BLOCKED | 로컬 158개 중 157개 적용, `20260814030000_matching_profile_preference_secret_roles.sql` 미적용 |
| 원격 전용 migration | 확인 | UUID 보정·서비스 ACL·QA 정리 3개가 원격에만 존재함 |
| Supabase 보안 Advisor | PASS | 보안 0건, 성능 0건 |
| public 테이블 RLS | PASS | 73개 전부 활성화, 비활성 0개 |
| `SECURITY DEFINER` 기본 권한 | PASS | 212개 모두 고정 `search_path`, PUBLIC·anon 실행 권한 0개 |
| authenticated 함수 권한 | REVIEW | 123개 앱 RPC 실행 가능, 개별 업무 행위 E2E는 별도 필요 |
| 외모 점수 비공개 저장 | 저장 증거 확인 | `ready` 1건, 승인 모델·프롬프트·anchor 계약 일치, 브라우저 테이블 권한 0개 |
| Toss 결제 상태 | 미완료 | deposit `pending` 1건, 승인·환불·이월 0건 |
| AI 서버 | PASS | 운영 HTTPS `/health` 정상, analyzer 준비됨 |
| Vercel 운영판 | OUTDATED | 기존 `coffee` 계약만 지원하며 `coffee-main`, `coffee-north`는 400 |
| Expo 산출물 | 오래된 산출물만 존재 | AAB build 6, APK build 5 완료 상태이나 8월 13일 빌드로 최신 코드 아님 |

## 브라우저 검증

- 정문 커피 직접 URL: 17곳이 정문 항목으로 표시됨
- 북문 커피 직접 URL: 13곳이 북문 항목으로 표시됨
- 최초 안내 3장, 방문 7곳 선택, 8강·준결승·결승을 직접 클릭함
- 결과: 정확히 6번 대결 후 챔피언 1곳, 누적 Elo 순위 별도 표시
- 모바일 390x844: 가로 넘침과 겹침 없음
- 데스크톱 1440x900: 챔피언과 커뮤니티 맛집 월드컵 노출 확인
- 브라우저 오류 로그: 0건

## 배포 검사 보정

- 운영 모드에서 `/dev/preview`는 의도대로 404가 됨
- 경로 검사기가 이 의도된 404를 장애로 오판하던 문제를 수정함
- 운영형 서버에서 공개 경로 200, 개발 전용 경로 404, 보호 경로 로그인 이동 307을 확인함
- 개발 전용 화면을 운영에 노출시키지 않고도 경로 검사가 통과함

## 남은 운영 검증

- 사용자 승인 후 누락된 secret-role migration 1개를 원격에 적용하고, 원격 전용 migration 3개와 충돌하지 않는지 재검증
- 실제 2·4·5개 계정으로 초대, 커플, 매칭, 커뮤니티, 사진 흐름 E2E
- 기존 실제 OpenAI 점수 저장 증거는 확인했으나, 동일 사진 재사용과 사진 변경 무효화 API 흐름은 실제 계정으로 재검증
- Toss 테스트 결제 승인, 전액 환불, 다음 매칭 이월 전체 흐름
- 깨끗한 커밋만 push한 뒤 최신 Vercel 배포와 운영 `coffee-main`·`coffee-north` 계약 재검증
- 최신 APK/AAB 생성, 실기기 설치, Google·Kakao 앱 복귀
- 맛집 사진 사용권, 현재 영업 상태, 저해상도 원본 품질 확인
- Campus Eats Elo·방문 기록 계정 동기화와 학교 전체 통계

## 알려진 도구·의존성 위험

- 현재 Vercel CLI 인증 파일에 실제 token이 없고, Windows 한글 환경에서 인증 오류 메시지 처리도 실패함. 대시보드 인증 또는 명시적 CLI token 연결이 필요함.
- 모바일 `npm audit`은 Expo·Metro 전이 의존성에서 22건(중간 8, 높음 14)을 보고함. 자동 강제 수정은 Expo 57을 53으로 내리는 파괴적 변경이라 적용하지 않음.
- 원본 작업 폴더의 잔여 변경은 이번 커밋 범위와 무관하며 자동 stage하지 않음.
