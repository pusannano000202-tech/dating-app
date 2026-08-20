# Quantum 현재 HEAD 독립 검증 기록

> 검증일: 2026-08-19 (Asia/Seoul)
> 기준 브랜치: `codex/quantum-handphone`
> 기준 HEAD: `982eeaa20249c0e30ace249bebb5f9e678f0e5a2`
> 깨끗한 검증 경로: `C:\Users\82108\AppData\Local\Temp\quantum-source-truth-verify-20260819-982eeaa2`

## 1. 결론

`982eeaa2`는 웹·모바일·Python의 **로컬 코드 후보**로 사용할 수 있다. 다만 원격 migration 이력 불일치, 실계정 E2E 부재, 현재 Git SHA와 다른 Android 산출물, 운영판의 구버전 Campus Eats 때문에 아직 출시 기준본은 아니다.

| 영역 | 판정 | 근거 |
| --- | --- | --- |
| 웹 테스트·타입·린트·빌드 | `PASS` | 깨끗한 체크아웃에서 전부 통과 |
| 공개 화면 브라우저 | `PASS_WITH_FLAGS` | 기능 플래그를 켠 운영형 빌드에서 데스크톱·모바일 확인 |
| 로그인 이후 핵심 동선 | `UNVERIFIED` | 실제 로그인 계정을 사용하지 않음 |
| 모바일 소스 | `PASS_WITH_DEPENDENCY_RISK` | 테스트·타입·Expo Doctor 통과, 의존성 감사 22건 남음 |
| Python 외모분석 | `PASS_WITH_LINT_GAP` | 66 통과·17 모델 가중치 의존 건너뜀, Ruff 18건 남음 |
| Supabase 원격 DB | `BLOCKED_BY_HISTORY_DRIFT` | migration 이름·버전 계보가 로컬과 불일치 |
| Vercel 운영판 | `REMOTE_OUTDATED` | 공개 화면은 동작하지만 Campus Eats가 구버전 2분류 |
| Android AAB/APK | `REMOTE_OUTDATED` | 완성 산출물은 있으나 현재 HEAD fingerprint와 다름 |
| Toss·AI 운영 서버 | `UNVERIFIED` | 실제 승인·환불·이월과 운영 AI HTTPS E2E 증거 없음 |

## 2. 웹 로컬 검증

### 자동 검증

| 검증 | 결과 |
| --- | --- |
| `npm run test:auth` | 18/18 통과 |
| `npm run test:profile` | 131/131 통과 |
| `npm run test:matching` | 410/410 통과 |
| `npm run test:config` | 274/274 통과 |
| 합계 | 833/833 통과 |
| `npm run typecheck` | 통과 |
| `npm run lint` | 통과. 단, `next lint` 폐기 예정 경고가 있어 이후 ESLint CLI 전환 필요 |
| `npm run check:secrets` | 통과 |
| `npm audit --omit=dev --audit-level=moderate` | 알려진 취약점 0건 |
| `npm audit --audit-level=moderate` | 알려진 취약점 0건 |
| 기본 운영형 빌드 | 110개 페이지 생성, 통과 |
| 기능 플래그 운영형 재빌드 | 110개 페이지 생성, 통과 |

### 기능 플래그 경계

`NEXT_PUBLIC_COMMUNITY_ENABLED`와 `NEXT_PUBLIC_CAMPUS_EATS_ENABLED`가 없으면 코드가 의도적으로 커뮤니티·모임을 준비 화면으로 내리고 Campus Eats를 404 처리한다. 같은 HEAD를 두 플래그가 켜진 상태로 빌드하면 실제 화면이 포함된다.

따라서 다음 두 설정은 최신 화면 배포의 필수 조건이다.

- `NEXT_PUBLIC_COMMUNITY_ENABLED=true`
- `NEXT_PUBLIC_CAMPUS_EATS_ENABLED=true`

검증용 값은 운영 환경이나 원본 작업공간에 저장하지 않았다.

## 3. 브라우저 검증

기능 플래그가 켜진 깨끗한 운영형 빌드를 `1440x900`과 `390x844`에서 확인했다.

| 화면/동선 | 결과 |
| --- | --- |
| 로그인 인트로 -> 로그인 방식 선택 | 버튼 작동, 콘솔 오류 0 |
| 커뮤니티 | 최신 허브 노출, 가로 넘침 없음, 콘솔 오류 0 |
| 모임 | 카테고리·활동·새 모임 열기 노출, 가로 넘침 없음, 깨진 이미지 0 |
| Campus Eats | 7분류 노출: 돈가스 14, 피자 12, 치킨 14, 정문 커피 17, 북문 커피 13, 국밥 16, 밀면 8 |
| 월드컵 시작 | 3단계 진행 방법이 먼저 열림 |
| 대진 생성 | 먹어본 2곳 선택 후 2강 대진 생성 |
| 우승 처리 | 1회 선택 후 챔피언과 Elo 1504/1496 반영 확인 |
| 프로필·매칭·친구·알림 | 비로그인 상태에서 로그인 화면으로 이동 |
| 채팅 | 비로그인 상태에서도 빈 화면 껍데기가 열림. 데이터는 불러오지 못하지만 다른 보호 화면과 동선이 불일치 |

로그인 이후 프로필·사진·외모분석·매칭·친구·채팅의 실제 데이터 흐름은 확인하지 않았다. 테스트 계정이나 사용자 계정 없이 완료 처리하지 않는다.

## 4. 모바일 검증

| 검증 | 결과 |
| --- | --- |
| `npm test` | 153/153 통과 |
| `npm run typecheck` | 통과 |
| Expo Doctor | 21/21 통과 |
| `npm audit` | 22건: high 14, moderate 8 |

모바일 감사 항목은 Expo/Metro 빌드 도구 계보의 `image-size@1.2.1`, `uuid@7.0.3` 등에 연결된다. 자동 `--force` 수정은 Expo 호환성을 깨뜨리는 변경을 제안하므로 적용하지 않았다. Expo 호환 버전 확인 후 의존성 묶음으로 갱신해야 한다.

## 5. Python 외모분석 검증

| 검증 | 결과 |
| --- | --- |
| `uv run ... python -m pytest -q` | 66 통과, 17 건너뜀 |
| 건너뜀 사유 | 실제 모델 가중치가 필요한 테스트 |
| 경고 | Starlette/httpx 폐기 예정 경고 1건 |
| `ruff check .` | 18건 실패 |

Ruff 18건은 import 정렬, 사용하지 않는 `AXES`, 사용하지 않는 `os`, E402 한 건이다. 제품 동작 실패 증거는 아니지만 깨끗한 품질 게이트는 아니므로 별도 코드 수정 후보로 둔다.

## 6. Supabase 원격 상태

확인한 프로젝트는 `jyfwcanjqwboyvicoafm` (`quantum-production`, `ACTIVE_HEALTHY`)이다. DDL이나 migration은 적용하지 않았다.

### Migration 계보

| 항목 | 수량 |
| --- | ---: |
| 로컬 SQL 파일 | 158 |
| 원격 적용 migration | 160 |
| 이름이 정확히 같은 항목 | 151 |
| 정확한 이름 기준 로컬 전용 | 7 |
| 정확한 이름 기준 원격 전용 | 9 |
| 같은 이름이지만 version이 다른 항목 | 42 |

원격 전용 9개 중 6개는 원격 이름 자체에 이전 timestamp가 한 번 더 포함된 항목이다. 이를 논리 이름으로 정규화하면 공통 157개, 로컬 전용 1개, 원격 전용 3개다.

- 로컬 전용: `matching_profile_preference_secret_roles`
- 원격 전용: `quantum_event_match_finalization_uuid_fix`
- 원격 전용: `quantum_event_match_finalization_service_acl`
- 원격 전용: `quantum_event_match_finalization_qa_cleanup`

원격 전용 3개의 로컬 파일은 `codex/quantum-store-readiness` 계보에서 발견됐다. 현재 상태에서 `db push`를 실행하면 이미 적용된 기능 migration을 중복 적용할 가능성이 있으므로 먼저 migration 이력을 복원·정렬해야 한다.

### Advisor

| 종류 | 결과 |
| --- | --- |
| Security | 165건: INFO 41, WARN 124 |
| RLS 활성·정책 없음 | 41개 테이블 |
| authenticated가 실행 가능한 SECURITY DEFINER 함수 | 123개 |
| 유출 비밀번호 보호 비활성화 | 1건 |
| Performance | INFO 38건 |
| 인덱스 없는 FK | 3건 |
| 사용되지 않은 인덱스 | 35건 |

SECURITY DEFINER 123개는 일부가 의도된 RPC이므로 일괄 권한 박탈하지 않는다. 각 함수의 호출 주체, 내부 소유권 검사, `search_path`, 반환 데이터, 직접 테이블 접근 차단을 함수별로 감사해야 한다.

## 7. Vercel 운영판

- `https://dating-app-silk.vercel.app/api/health`: 200, Supabase 연결 표시
- `/community`: 최신 커뮤니티 허브가 열림
- `/meetups`: 모임 허브가 열림
- `/community/campus-eats`: 열리지만 `돈까스/커피` 2분류 구버전
- 운영판 Campus Eats에는 정문 커피·북문 커피 분리와 7분류 최신 계약이 없음
- CSP, COOP, HSTS, Referrer-Policy, `nosniff`, `DENY` 헤더 확인

로컬 `.vercel/project.json`은 `dating-app`에 연결돼 있다. 다만 Vercel CLI 54와 59 모두 한국어 Windows 사용자명을 HTTP 헤더로 처리하지 못해 `whoami`가 실패했다. 운영 배포의 Git SHA를 CLI로 증명하지 못했으므로 새 배포는 수행하지 않았다.

## 8. Android EAS 상태

### 현재 존재하는 최신 산출물

| 종류 | Build ID | 상태 | versionCode | Git SHA |
| --- | --- | --- | ---: | --- |
| Production AAB | `949302b7-dc36-4af8-9eaf-2dbc98183906` | FINISHED | 6 | 없음 |
| Preview APK | `d6b2d356-68b7-422e-8b45-f774a9621ac0` | FINISHED | 5 | 없음 |

두 산출물의 fingerprint는 `764ef18a906d17d360cfc4ecacfc43eae9f60b3b`이고, 현재 `982eeaa2`의 production/preview fingerprint는 `bb78565db7b0c8f37a50aec1bc4321295784c125`다. 따라서 완성된 AAB/APK를 현재 HEAD 산출물로 간주할 수 없다.

이전 실패 빌드 `311ad034...`와 `15b759e6...`는 당시 업로드 archive에 `apps/mobile/package.json`이 없어 실패했다. 현재 HEAD의 `eas build:inspect` archive에는 다음 파일이 포함돼 과거 원인은 해소됐다.

- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `apps/mobile/eas.json`

새 AAB/APK 생성, 실제 Android 설치, Google·Kakao 앱 복귀는 아직 수행하지 않았다.

## 9. 출시 차단 항목

1. 원격 migration 이력과 로컬 파일 계보 정렬
2. SECURITY DEFINER 123개 함수별 권한 감사
3. 실제 2계정·5계정 인증 E2E
4. 실제 사진 분석·비공개 점수 저장·재사용·사진 변경 무효화
5. Toss 테스트 승인·전액 환불·다음 매칭 이월
6. 현재 승인 SHA로 새 AAB/APK 생성·실기기 설치
7. Vercel 운영 환경의 기능 플래그·AI 주소·앱 origin 확인
8. 채팅 비로그인 화면의 로그인 경계 일관성 결정

## 10. 수행하지 않은 작업

- stage, commit, push
- Supabase migration 또는 권한 변경
- Vercel 배포
- 새 EAS 원격 빌드
- 실제 결제·환불
- 사용자 사진 변경
- worktree·원본·중복 파일 삭제
