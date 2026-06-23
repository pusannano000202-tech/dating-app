# 문서 인덱스 (docs/)

제품 영역별로 문서를 묶어둔다. 새 문서를 추가할 때 아래 분류 규칙을 따른다.

```text
매칭/과팅/보증금/카드  → product/matching/
이상형 월드컵/외모·성격 벡터/이미지 → product/profile-worldcup/
친구·초대·그룹 초대     → product/social/
운영/관리자/환불/노쇼/마이그 검증 → product/operations/
인터페이스 계약·협업·코드리뷰   → engineering/
인수인계 문서           → handoff/active (유효) / handoff/archive (과거 덤프)
계획/진행상황           → plans/
오래되어 보존만         → archive/
삭제 후보 (격리)        → delete-candidates/
```

## 폴더 지도

| 폴더 | 내용 |
|---|---|
| `plans/` | 현재 계획 허브 — 활성 의사결정, 구현 상태, 다음 단계 |
| `product/matching/` | 매칭·과팅·보증금·데일리카드·만남 라이프사이클 |
| `product/profile-worldcup/` | 이상형 월드컵, 외모/성격 벡터, 이미지 메타데이터 |
| `product/social/` | 친구추가·초대·그룹 초대 |
| `product/operations/` | 운영자·환불·노쇼·마이그레이션 검증 리포트 |
| `engineering/` | 인터페이스 계약·협업 규칙·코드 리뷰 |
| `handoff/active/` · `handoff/archive/` | 인수인계 (유효 / 과거) |
| `archive/` | 날짜 박힌 옛 스냅샷·구 마스터플랜 (보존용) |
| `delete-candidates/` | 삭제 후보 격리 — 바로 지우지 않고 1회 검토 후 삭제 |

## 루트에 남겨둔 문서 (영역 모호 / 활성 마스터)

- `CODEX_MASTER_2026-05-23.md` — 프로젝트 마스터 source of truth (참조처 많아 이동 보류)
- `PLAN_2026-05-23_V2_PLATFORM_EXPANSION.md` — v2 확장 계획 (영역 모호)
- `SUNGJUN_MEETING_AGENDA_2026-06-01.md` — 회의 안건 (영역 모호)

> 이동 규칙·단계는 `plans/DOCUMENT_ORGANIZATION_PLAN.md` 참조.
