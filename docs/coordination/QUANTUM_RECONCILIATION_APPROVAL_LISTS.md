# Quantum 정리 승인 목록

> 기준일: 2026-08-19
> 기준 HEAD: `982eeaa2`
> 원칙: 승인 전에는 이동·삭제·ignore·stage·commit·push·migration·deploy를 하지 않는다.

## 1. 추천 승인 순서

1. 이번 정리 문서 7개만 독립 커밋
2. migration 계보 복원과 권한 감사를 별도 코드 작업으로 수행
3. 출시 준비 브랜치에서 계정 삭제·법적 공개 파일만 선별 이식
4. 웹·Python·모바일 품질 미해결 항목 수정
5. 실제 계정 E2E 후 GitHub·Supabase·Vercel·EAS를 같은 SHA로 승격

## 2. 바로 커밋 후보

아래 7개는 제품 코드·DB·런타임 자산을 바꾸지 않고 현재 상태와 승인 경계를 기록한다.

1. `docs/superpowers/plans/2026-08-19-quantum-workspace-source-of-truth-reconciliation.md`
2. `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`
3. `docs/coordination/QUANTUM_ASSET_INVENTORY.csv`
4. `docs/coordination/QUANTUM_WORKTREE_LEDGER.csv`
5. `docs/coordination/QUANTUM_SOURCE_OF_TRUTH.md`
6. `docs/coordination/2026-08-19-current-head-clean-verification.md`
7. `docs/coordination/QUANTUM_RECONCILIATION_APPROVAL_LISTS.md`

추천 커밋 메시지:

```text
docs(coordination): record Quantum source of truth audit
```

이 커밋에는 기존 추적 변경 49개, 제품 코드, migration, 이미지, QA 원본을 포함하지 않는다.

## 3. 내용 검토 후 커밋 후보

### 현재 작업공간 문서·메타데이터

| 분류 | 파일 수 | 용량 | 처리 |
| --- | ---: | ---: | --- |
| `CANDIDATE` | 99 | 2.44 MiB | 문서별 승인·현재 코드 연결 확인 후 작은 묶음으로 커밋 |
| `SUPPORTING` | 186 | 11.51 MiB | 재현에 필요한 QA·메타데이터만 증거 커밋 후보 |
| `SUPERSEDED` | 10 | 0.23 MiB | 삭제하지 않고 archive 표시 유지 |

### 코드 수정 후보

- Python Ruff 18건 정리
- 모바일 Expo/Metro 의존성 22건을 호환 버전으로 갱신
- 비로그인 `/chat` 화면의 로그인 경계 통일
- `next lint`를 ESLint CLI로 전환
- `docs/engineering/INTERFACE_CONTRACT.md`의 휴대폰 자동 공개·예전 2:2/3:3 계약 갱신

### 별도 브랜치 선별 이식 후보

`codex/quantum-store-readiness` 전체를 merge하지 않고 다음만 파일 단위로 보안 리뷰한다.

- 계정 삭제 요청 API·웹·모바일·migration
- 개인정보처리방침·이용약관·아동 안전·계정 삭제 안내
- 운영 의존성 보안 감사 게이트
- 내부 RPC 오류 비노출 보강
- Google Play 제출 초안

## 4. 원본 별도 보관

| 묶음 | 파일 수 | 용량 | 이유 |
| --- | ---: | ---: | --- |
| `HOLD` 전체 | 7,876 | 290.47 MiB | 출처·중복·현행 여부를 확정하기 전 보존 |
| 음식점 조사 원본 | 7,234 | 75.65 MiB | 서비스 자산이 아니라 조사·출처 원본 |
| 사용자 제공 맛집 원본 | 128 | 109.99 MiB | 사용자 원본이며 사진 권리 검토 필요 |
| 다대학 마스코트 후보 | 406 | 87.77 MiB | 부산대 현재 런타임과 무관한 확장 자산 |
| 런타임 밖 source master | 5 | 15.07 MiB | 추적 WebP의 원본 보존본 |

다음 dirty worktree도 사용자 작업이 있으므로 보존한다.

- 이전 외모 선호 UI와 이미지 908개가 있는 worktree
- 이전 daily-card 파일 4개가 있는 worktree
- staged 검증 파일 5개가 있는 worktree
- Quantum과 별도인 새벽별 지도 worktree 11개

## 5. `.gitignore` 추가 후보

`GENERATED` 415개, 59.18 MiB는 재생성 가능한 보고서·표시용 생성 산출물이다. 사용자 승인 후 **경로별로** ignore 규칙을 만들 수 있다.

현재 제안은 ignore만이며 삭제가 아니다. 원본, 사용자 제공 파일, QA 근거, 최종 런타임 자산을 함께 숨기는 넓은 규칙은 만들지 않는다.

## 6. 삭제 보류

다음 항목은 정리 후보여도 지금 삭제하지 않는다.

- SHA-256 중복 그룹 657개에 속한 자산 4,565개
- 모든 추적 파일이 사라진 임시 worktree 4개
- 현재 후보의 깨끗한 조상 worktree 3개
- `SUPERSEDED` 문서 10개
- 루트의 빈 Expo 설정 후보 `app.json`
- 생성 마스코트 및 화면 보고용 이미지

worktree 7개는 사용자 승인 후에도 `git worktree list`, branch reachability, dirty 상태를 다시 확인한 뒤 하나씩 처리한다.

## 7. DB·보안 선행 작업

원격 migration 적용 전에 아래 순서를 지킨다.

1. 원격 전용 3개 migration 파일을 Git 계보에서 현재 브랜치로 복원
2. 원격 이름에 timestamp가 중복된 6개 migration을 이력표로 연결
3. 같은 이름인데 version이 다른 42개를 로컬·원격 대응표로 고정
4. 새 `matching_profile_preference_secret_roles` SQL을 기존 스키마와 재검토
5. `supabase migration list`와 dry-run 비교
6. 사용자에게 적용 SQL과 영향 테이블을 별도 보고
7. 별도 승인 후에만 원격 적용

SECURITY DEFINER 함수 123개는 호출 권한을 일괄 회수하지 않는다. 함수별 소유권 검사와 API 사용처가 확인된 뒤 최소 권한으로 조정한다.

## 8. 외부 환경·사용자 협력이 필요한 항목

- 실제 계정 2개: 친구 초대·카드 열람·댓글 소유권·데이트 제안
- 실제 계정 5개: 이벤트방 정원·초과 차단·15분 친구 자리 예약
- 실제 사용자 사진 1장: 분석 저장·재사용·교체 무효화
- Toss 테스트 결제: 승인·전액 환불·다음 매칭 이월
- Android 실기기: 새 APK 설치·Google/Kakao 앱 복귀
- Google Play Console: 내부 테스트·정책·스토어 정보
- 사진 권리와 음식점 영업 상태 최종 확인

## 9. 이번 승인 게이트

현재 가장 안전한 다음 행동은 **2절의 문서 7개만 커밋하는 것**이다. 승인되기 전에는 나머지 8,000여 파일, 49개 기존 추적 변경, 코드, migration, worktree를 스테이지하지 않는다.

승인 문구 예시:

```text
정리 문서 7개만 커밋 승인
```
