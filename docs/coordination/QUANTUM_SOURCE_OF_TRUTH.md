# Quantum 현재 기준 대장

> 기준 시각: 2026-08-19 (Asia/Seoul)
> 기준 작업공간: `C:\데이팅앱만들기`
> 기준 브랜치: `codex/quantum-handphone`
> 기준 HEAD: `982eeaa2`
> 목적: 로컬 코드, 설계 문서, 원격 DB, GitHub, Vercel 상태를 섞지 않고 기능별 최신 기준을 한 곳에 고정한다.

## 1. 판정 규칙

이 문서에서 사용하는 상태는 다음과 같다.

| 상태 | 의미 |
| --- | --- |
| `CURRENT_LOCAL` | 현재 HEAD에 구현되어 있고 깨끗한 체크아웃 검증 증거가 있다. |
| `APPROVED_DESIGN` | 사용자 승인 설계지만 제품 코드 또는 DB 구현 증거가 없다. |
| `REMOTE_OUTDATED` | 로컬 후보보다 GitHub, Vercel, Supabase 또는 모바일 산출물이 오래됐다. |
| `DECISION_REQUIRED` | 승인 문서끼리 충돌하거나 운영·정책 결정이 필요하다. |
| `HOLD` | 보존하되 현재 제품 기준으로 사용하지 않는다. |

`HTTP 200`, 소스 테스트, 정적 화면, 문서 작성만으로 운영 완료라고 판정하지 않는다. 실제 계정, 원격 DB, 운영 배포, 실기기 증거는 각각 따로 확인한다.

## 2. 세 개의 현재 버전

| 구분 | 현재 기준 | 판정 |
| --- | --- | --- |
| 로컬 제품 후보 | `982eeaa2` | 핵심 앱 기능의 주 후보. `65af2a52` 이후 제품 코드는 같고 출시 대장 문서만 변경됐다. 단, 아래 출시 준비 브랜치의 미흡수 항목이 있다. |
| GitHub 작업 브랜치 | `origin/codex/quantum-handphone` = `9376af9d` | 로컬보다 24커밋 뒤. `REMOTE_OUTDATED` |
| GitHub `main` | `origin/main` = `e25aec55` | 현재 출시 후보와 별개. 자동 최신으로 간주하지 않는다. |
| Vercel 운영판 | 커뮤니티·모임은 동작하지만 Campus Eats는 `돈까스/커피` 2분류 구버전 | `REMOTE_OUTDATED` |
| Android 산출물 | 2026-08-13 완성 AAB/APK가 있으나 Git SHA가 없고 현재 HEAD와 fingerprint 불일치 | `REMOTE_OUTDATED` |

따라서 현재 로컬 HEAD는 **핵심 앱 기능을 이어갈 주 후보**다. 다만 GitHub와 운영판에 반영되지 않았고, `codex/quantum-store-readiness`의 일부 출시 필수 항목도 아직 합쳐지지 않아 운영 완료 상태는 아니다.

### 2.1 별도 브랜치에서 발견된 출시 후보

`codex/quantum-store-readiness`는 현재 HEAD와 2026-08-12의 `abf2a8ea`에서 갈라졌고, 현재 후보에 없는 독자 커밋 43개가 있다. 오래된 Campus Eats·그룹·매칭 변경은 현재 구현과 충돌할 수 있어 브랜치 전체를 합치지 않는다. 다음 항목만 파일 단위로 재검토할 가치가 있다.

- 계정 삭제 요청 API·웹·모바일 화면과 migration
- 개인정보처리방침, 이용약관, 아동 안전, 계정 삭제 안내 공개 페이지
- 운영 의존성 보안 감사 차단 검사
- 내부 RPC 오류 비노출 보강
- Google Play 제출 초안 문서

현재 HEAD에는 위 계정 삭제·법적 공개 페이지 파일이 존재하지 않는다. 판정은 `RELEASE_RECONCILIATION_REQUIRED`이며 Task 6 승인 목록에 별도 후보로 올린다.

## 3. 기능별 최신 기준

| 영역 | 제품/설계 기준 | 현재 코드 기준 | DB·API 기준 | 검증 및 원격 상태 | 다음 행동 |
| --- | --- | --- | --- | --- | --- |
| 인증 | OTP·OAuth, 서버가 웹 쿠키와 모바일 Bearer 토큰을 모두 검증 | `b41c24c6`, `cf04bd56` | 비공개 API는 서버 인증 경계 사용 | 로컬 인증 18/18. 실제 Google·Kakao 앱 복귀 미검증 | 최신 APK에서 실기기 E2E |
| 프로필·사진 | 채팅형 기본 정보, 사진은 서버 중계 업로드, 상대 사진은 만남 종료 전 비공개 | `b43d3b89` | 사진 교체 시 외모 점수 무효화, 비공개 저장 계약 | 로컬 프로필 131/131. 실제 계정 사진 교체·재사용 미검증 | 원격 migration 정합 후 실제 사진 1장 E2E |
| 외모 분석 | 점수·원본 사진 경로를 참가자에게 노출하지 않고 내부 매칭 보조로만 사용 | `b43d3b89`, `b41c24c6` | `private_appearance_scores` 계열 서버 전용 | 운영 DB에 `ready` 저장 증거 1건은 있으나 동일 사진 재사용·교체 무효화 미검증 | 실제 계정으로 저장·재사용·무효화 확인 |
| 오늘 바로 | Quantum이 활동·시간·장소를 정하고 기본 3남 2녀, 친구/혼자 신청 지원 | `694eed56` | 이벤트·방·신청·취소·친구 초대 API | 로컬 매칭 410/410. 5계정 실제 편성 미검증 | 5계정 동시 신청과 정원 초과 방지 E2E |
| 날짜 골라 만나기 | 특정 날짜의 긴 활동을 Quantum이 제안 | `694eed56` | 오늘 바로와 공통 이벤트 계약 사용 | 로컬 구현, 실제 일정·취소·알림 E2E 미검증 | 2계정 이상 일정 흐름 확인 |
| 이벤트 방·사전 카드 | 얼굴·실명 대신 같은 방의 안전한 카드만 공개, 친구 자리는 15분 예약 | `694eed56` | 같은 방 권한, 정원, 초대 만료를 서버에서 강제 | 로컬 테스트는 통과. 2계정 카드 열람과 5계정 정원 E2E 미검증 | 원격 migration 적용 후 실제 계정 검증 |
| 평소 취향·오늘 카드·비밀 역할 | 평소 취향은 재사용, 오늘 카드는 만남별, 비밀 역할은 본인 전용 | 승인 설계 `2026-08-14-quantum-profile-preferences-secret-role-design.md`; 구현 커밋은 매칭 묶음에 포함 | 로컬 migration `20260814030000_matching_profile_preference_secret_roles.sql` | 로컬 통과, 2026-08-18 기준 원격 미적용 | 원격 전용 migration 3개와 충돌 검토 후 승인 적용 |
| 친구·초대·채팅 | 친구 초대, 앱 내 채팅, 삭제 시 상호 비노출·다음 매칭 제외 | `a0460a09`, `694eed56` | 서버 인증 API와 RLS 사용 | 로컬 통과. 실제 2계정 초대·삭제·재해제 미검증 | 실제 2계정 E2E |
| 일반 모임 | 사용자가 운동·게임·스터디 등 활동 방을 만들고 참여 | `a0460a09` | 모임 생성·참여 API | 로컬 통과. 실제 생성자/참여자 2계정 E2E 미검증 | 실제 계정 생성·참여·취소 확인 |
| 커뮤니티 | 목록 먼저, 상세·댓글·답글, 글·댓글 좋아요/싫어요, 본인만 삭제 | `b129e970`, `2934115c` | 게시글·댓글·반응은 서버 소유권 검사 | 로컬 통과. 실제 2계정 타인 삭제 차단과 반응 1인 1표 미검증 | 2계정 권한 E2E |
| Campus Eats | 7개 월드컵, 방문한 곳끼리 대결, 개인 챔피언과 Elo 순위 분리 | `ad639704`, `e046936a`, `c9abb952`, `b129e970` | 로컬 fixture가 현재 데이터 기준, 원격 계정 동기화는 미완료 | 로컬 14/12/14/17/13/16/8 카드, 브라우저 챔피언 검증. Vercel 구버전 | 사진 권리·영업 상태 확인 후 배포, 원격 저장 계약 확정 |
| 보증금·결제 | 1만원은 전액 반환 또는 다음 매칭 이월, 후원은 별도 | `9c18bc56`, 관련 서버 API | Toss 테스트 모드, 서버 소유권 검사 | pending 1건 증거만 있음. 승인·전액 환불·이월 미검증 | Toss 테스트 전체 흐름과 운영 스케줄러 검증 |
| 모바일 | Expo React Native, 동일 Supabase 프로젝트와 서버 API 사용 | `apps/mobile`, `3c79c0cc` | 웹과 같은 사용자·DB, 모바일 토큰 사용 | 타입·153/153·Expo Doctor 21/21. audit 22건과 현재 HEAD 실기기 미검증 | 의존성 호환 검토 후 새 APK/AAB 생성·설치·소셜 로그인 복귀 |
| 보안·배포 | 브라우저가 서비스 키·결제 비밀·외모 원점수에 직접 접근하지 않음 | `b41c24c6`, `1571d027`, `fcdf2ba1` | RLS와 서버 API 경계 | 원격 security advisor 165건, performance 38건. Vercel 운영 SHA 미확인 | migration 계보·함수 권한·환경변수 재점검 후 배포 |
| 계정 삭제·법적 공개 | Play 출시 전 계정 삭제, 개인정보처리방침, 이용약관, 아동 안전 페이지 필요 | 현재 HEAD에 없음. `codex/quantum-store-readiness`에만 후보 구현 존재 | `20260812094040_account_deletion_requests.sql`도 별도 브랜치에만 존재 | 현재 후보 기준 미구현 | 브랜치 전체 merge 금지, 필요한 파일만 보안 리뷰 후 이식 후보 |
| 오프라인 5장면 | 약 10일, 오프라인 5회, 3번째부터 6번째 참가자 합류 | `APPROVED_DESIGN`인 `2026-08-16-quantum-offline-five-scene-season-design.md` | 전용 테이블·API 없음 | 구현 증거 없음 | 별도 구현 계획과 승인 전 코드 작업 금지 |

## 4. 설계 우선순위

같은 기능의 문서가 충돌할 때 다음 순서로 해석한다.

1. 사용자의 최신 명시 승인
2. 날짜가 더 최신이고 `사용자 승인`이 적힌 `docs/superpowers/specs/`
3. 현재 HEAD의 실제 코드와 테스트
4. `docs/product/`의 제품 방향서
5. `docs/engineering/INTERFACE_CONTRACT.md`
6. `docs/handoff/active/`
7. `docs/archive/`, 이전 계획, 정적 시안

하위 문서가 상위 문서보다 새 제품 결정을 더 정확히 담고 있으면 계약 변경 후보로 보고한다. 문서만 보고 기존 코드가 구현됐다고 추정하지 않는다.

## 5. 충돌 잠금 목록

### 5.1 외부 연락처 자동 공개

- `docs/engineering/INTERFACE_CONTRACT.md`에는 약속 시각에 휴대폰 번호를 자동 공개하는 오래된 조항이 있다.
- 최신 제품 방향은 외부 연락처 요구 압박을 금지하고 앱 내 친구·채팅으로 이어가는 것이다.
- 판정: `DECISION_REQUIRED`, 출시 차단 항목.
- 해결 전까지 새 코드에서 휴대폰 번호 자동 공개를 확대하거나 복원하지 않는다.

### 5.2 예전 2:2·3:3 과팅과 성향·시간·가중치

- 과거 그룹 생성 문서와 인터페이스 계약의 `available_timeslots`, `preference_weights`는 현재의 활동 기반 3남 2녀 이벤트 방향과 다르다.
- 현재 화면에서 숨긴 기능을 과거 문서를 근거로 다시 노출하지 않는다.
- 평소 취향·오늘 카드는 탈락 점수나 공개 프로필이 아니라 대화 보조 정보다.
- 판정: 이전 2:2·3:3 중심 문서는 `HOLD`; 새 이벤트 계약이 우선한다.

### 5.3 5일 프로그램과 오프라인 5장면

- `docs/handoff/active/QUANTUM_FIVE_DAY_GUIDED_PROGRAM_MASTER_HANDOFF_2026-08-15.md`의 온라인 회차·자동 친구 규칙은 최신 5장면 설계와 충돌한다.
- 최신 기준은 `docs/superpowers/specs/2026-08-16-quantum-offline-five-scene-season-design.md`다.
- 판정: 오래된 5일 인계서는 `HOLD`, 5장면은 `APPROVED_DESIGN`이며 아직 미구현이다.

### 5.4 자동 친구 연결과 동의

- 일반 이벤트 종료 후 자동 친구 연결이라는 제품 방향과, 5장면 프로그램의 최종 상호 선택은 서로 다른 기능이다.
- 일반 이벤트 규칙을 5장면 프로그램에 자동 전파하지 않는다.
- 판정: 기능별 별도 계약 유지.

### 5.5 외모 점수 사용 범위

- 외모 원점수와 정규화 점수는 참가자에게 공개하지 않는다.
- 현재 이벤트 편성에 실제로 연결됐다는 운영 증거가 없으므로 연결 완료라고 말하지 않는다.
- 공정성·동의·고지·이의제기 정책 승인 전에는 외모 점수를 탈락, 공개 순위, 노출 차등에 사용하지 않는다.

## 6. 검증 기준점

현재 HEAD의 제품 코드는 `65af2a52`와 동일하다. 2026-08-19에 `982eeaa2`를 별도 깨끗한 worktree에서 다시 검증했다.

- 웹 테스트 833/833
- 모바일 테스트 153/153
- 웹·모바일 타입 검사 통과
- 린트 경고 0
- Next.js 배포형 빌드 통과
- Expo Doctor 21/21
- Python 외모 분석 테스트 66 통과, 17 건너뜀, 실제 OpenAI 호출 0회
- 운영형 경로 점검 18/18
- 루트 의존성 알려진 취약점 0건
- 기능 플래그 운영형 빌드 110페이지 생성 통과
- 데스크톱 `1440x900`, 모바일 `390x844`에서 커뮤니티·모임·Campus Eats 가로 넘침 0, 깨진 이미지 0, 콘솔 오류 0
- Campus Eats 3단계 안내 -> 먹어본 2곳 선택 -> 결승 -> 챔피언·Elo 반영 동선 통과

미통과 또는 미검증 항목은 모바일 의존성 감사 22건, Python Ruff 18건, 로그인 이후 실계정 E2E다. 자세한 증거는 `docs/coordination/2026-08-19-current-head-clean-verification.md`에 있다.

## 6.1 원격 상태 재확인

- Supabase: 로컬 158개, 원격 160개 migration. 논리 이름 정규화 후 로컬 전용 1개, 원격 전용 3개이며 같은 이름의 version 불일치도 42개다.
- Supabase Security Advisor: INFO 41, WARN 124. WARN 중 123개는 authenticated가 실행 가능한 SECURITY DEFINER 함수다.
- Vercel: 공개 커뮤니티·모임은 동작하지만 Campus Eats는 최신 7분류가 아닌 구버전이다.
- EAS: 최신 완성 AAB/APK fingerprint `764ef18a...`; 현재 HEAD fingerprint `bb78565d...`. 현재 HEAD 산출물이 아니다.
- 기능 플래그가 없으면 커뮤니티·모임은 준비 화면, Campus Eats는 404가 되므로 Vercel 환경변수 확인이 출시 조건이다.

## 7. 현재 변경 파일 해석

- 추적 수정 49개는 모두 문서·운영 규칙이며 제품 소스 수정은 아니다.
- 2026-08-19 최초 스냅샷의 미추적 파일은 8,537개다.
- 전체 스냅샷 8,586개는 `QUANTUM_CHANGE_LEDGER.csv`에 SHA-256과 분류를 기록했다.
- 이미지 8,206개는 `QUANTUM_ASSET_INVENTORY.csv`에 참조 상태, 권리 검토 상태, 중복 그룹을 기록했다.
- 등록된 Git worktree 29개는 `QUANTUM_WORKTREE_LEDGER.csv`에 HEAD, 브랜치, dirty 상태, 현재 후보와의 계보를 기록했다.
- 원본 파일은 이동·삭제·수정하지 않았다.

## 8. 승인 전 금지 작업

다음 작업은 사용자 승인 목록이 나오기 전 수행하지 않는다.

- 대량 파일 이동·삭제 또는 `.gitignore` 변경
- stage, commit, push
- Supabase migration 적용
- Vercel 배포
- APK/AAB 새 배포
- 오래된 worktree 삭제

## 8.1 Worktree 감사 결과

등록된 worktree 29개를 모두 열어 HEAD, 브랜치, 수정 파일 수와 현재 후보와의 관계를 확인했다.

- 현재 활성 후보: 1개
- 새벽별 지도 별도 프로젝트: 11개. Quantum 정리에서 건드리지 않는다.
- 깨끗한 이전 검증 증거: 1개
- 별도 브랜치 내용 검토 필요: 6개
- 미커밋 제품 작업 보존: 3개
  - 이전 외모 선호 UI와 이미지 908개
  - 이전 데일리 카드 파일 4개
  - 이전 검증 worktree의 staged 파일 5개
- 사용자 승인 후 정리 가능한 후보: 7개
  - 모든 추적 파일이 사라진 임시 폴더 4개
  - 현재 후보의 조상이며 깨끗한 이전 체크아웃 3개

`codex/quantum-store-readiness`는 계정 삭제·법적 공개 페이지 후보 때문에 보존한다. 다른 worktree도 삭제·이동하지 않았으며, 세부 경로와 근거는 `QUANTUM_WORKTREE_LEDGER.csv`에 있다.

## 9. 다음 검증 순서

1. `QUANTUM_RECONCILIATION_APPROVAL_LISTS.md`의 정리 문서 7개 커밋 여부를 사용자에게 승인받는다.
2. 승인 후에도 migration과 제품 코드는 문서 커밋에 섞지 않는다.
3. 원격 migration 계보 복원과 SECURITY DEFINER 함수 감사를 별도 작업으로 수행한다.
4. 실제 계정 E2E를 통과한 뒤 현재 승인 SHA로 Vercel과 EAS 산출물을 만든다.
5. GitHub·Supabase·Vercel·EAS가 같은 SHA와 계약을 가리킬 때만 출시 후보로 승격한다.

## 10. 근거 파일

- `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`
- `docs/coordination/QUANTUM_ASSET_INVENTORY.csv`
- `docs/coordination/QUANTUM_WORKTREE_LEDGER.csv`
- `docs/coordination/2026-08-19-current-head-clean-verification.md`
- `docs/coordination/QUANTUM_RECONCILIATION_APPROVAL_LISTS.md`
- `docs/coordination/2026-08-18-worktree-verification-and-commit-split.md`
- `docs/product/matching/2026-08-09-quantum-guided-meeting-product-direction.md`
- `docs/superpowers/specs/2026-08-14-quantum-profile-preferences-secret-role-design.md`
- `docs/superpowers/specs/2026-08-14-quantum-event-room-precard-e2e-design.md`
- `docs/superpowers/specs/2026-08-16-quantum-offline-five-scene-season-design.md`
- `docs/superpowers/specs/2026-08-17-campus-eats-community-spotlight-design.md`
- `docs/superpowers/specs/2026-08-13-quantum-peach-air-color-system-design.md`
- `docs/engineering/INTERFACE_CONTRACT.md`
- `docs/engineering/COLLABORATION.md`
