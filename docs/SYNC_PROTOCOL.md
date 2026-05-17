# Destiny 프로젝트 협업 동기화 프로토콜

> 작성일: 2026-05-17  
> 목적: Claude Code와 Codex가 서로 엉키지 않도록 모든 세션에서 반드시 따라야 할 규칙

---

## 핵심 원칙: 단일 진실 소스

**`docs/CURRENT_STATE.md`가 프로젝트의 유일한 현재 상태 문서다.**  
모든 세션은 이 파일을 읽고 시작하고, 이 파일을 업데이트하고 끝낸다.

---

## 세션 시작 시 반드시 할 것 (순서대로)

```
1. git pull origin main
2. docs/CURRENT_STATE.md 읽기
3. docs/SYNC_PROTOCOL.md 읽기 (이 파일)
4. 내가 할 작업이 CURRENT_STATE.md의 "진행 중" 섹션과 겹치는지 확인
5. 겹치면 → 멈추고 사용자에게 알릴 것
6. 안 겹치면 → CURRENT_STATE.md의 "진행 중" 섹션에 내 작업 클레임 추가 후 push
```

## 세션 종료 시 반드시 할 것 (순서대로)

```
1. 작업한 파일들 commit (feature 브랜치 또는 main)
2. docs/CURRENT_STATE.md 업데이트:
   - "진행 중" → "완료"로 이동
   - 다음 작업자를 위한 메모 추가
3. docs/handoff/CLAUDE_CODEX_BRIDGE.md에 세션 결과 기록
4. git push
```

---

## 공용 파일 변경 규칙

아래 파일은 단독 수정 금지. 반드시 PR + 상대방 확인 후 merge:

| 파일 | 이유 |
|------|------|
| `lib/types.ts` | 두 모듈 모두에 영향 |
| `supabase/migrations/*.sql` | DB 스키마 변경은 되돌리기 어려움 |
| `docs/INTERFACE_CONTRACT.md` | 모듈 간 계약서 |
| `docs/CURRENT_STATE.md` | 단일 진실 소스 (충돌 주의) |

변경 필요 시 절차:
1. `docs/CURRENT_STATE.md`의 "변경 예고" 섹션에 내용 기록
2. 상대방 세션에서 확인 후 합의
3. PR 작성 → 머지

---

## 용어 통일 (이 이름만 사용)

| 개념 | 공식 이름 | 절대 쓰지 않을 표현 |
|------|-----------|-------------------|
| 사용자가 원하는 이성 외모 타입 | `appearance_type` (AppearanceType enum) | preferred_type, 이상형타입 |
| 자기유사 월드컵 결과 | `self_appearance_vector` (6차원 JSON) | self_appearance_score, 자기점수 |
| 외모 AI 점수 (사진 분석) | `appearance_score_normalized` (0~1 float) | AI점수, score |
| 자기유사 월드컵 이미지셋 (신규) | `female-64/`, `male-64/` (F01~F64, M01~M64) | female_self, self_worldcup_images |
| 자기유사 월드컵 이미지셋 (구) | `female/`, `male/` (참고용, 신규 작업 금지) | - |

---

## 담당 영역 (절대 침범 금지)

| 담당 | 영역 |
|------|------|
| Claude Code (충현) | `app/profile/`, `components/profile/`, `python/appearance/` |
| Codex (충현 지시) | `public/appearance-self/`, `public/appearance-types/` 이미지 생성 |
| 성준 (건드리지 말 것) | `app/group/`, `app/match/`, `python/matching/`, `components/matching/` |

---

## 브랜치 전략

```
main          ← 항상 동작하는 최신 코드
feature/claude/작업명   ← Claude Code 작업
feature/codex/작업명    ← Codex 작업
```

- main 직접 push 금지
- 작업 완료 후 PR → 충현이 직접 merge

---

## 소통 채널

- **Claude ↔ Codex 메시지**: `docs/handoff/CLAUDE_CODEX_BRIDGE.md`
- **현재 상태 확인**: `docs/CURRENT_STATE.md`
- **설계 계약**: `docs/INTERFACE_CONTRACT.md`
- **충현 세션 이력**: `docs/handoff/CHUNGHYUN_SESSION_STATE.md`

---

## 이 프로토콜을 무시하면 생기는 일 (실제 발생했던 문제들)

1. `self_appearance_score` vs `self_appearance_vector` 혼용 → DB 스키마 불일치
2. Codex가 이미지 만드는 동안 Claude가 같은 컴포넌트를 다른 방식으로 구현
3. BRIDGE.md 업데이트 없이 세션 종료 → 다음 세션이 이미 완료된 작업을 다시 함
4. dev 브랜치 내용이 main에 안 들어와서 일부 파일 유실 위험

**이 규칙은 협의 없이 변경할 수 없다.**
