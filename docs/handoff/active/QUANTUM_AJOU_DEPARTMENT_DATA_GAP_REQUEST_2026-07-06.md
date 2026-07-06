# Quantum 아주대 학과 데이터 보강 요청

작성일: 2026-07-06
작성자: 팀장방 Codex

## 요청 요약

현재 Quantum 프론트 학교 테마 registry에는 `ajou` 아주대학교가 포함되어 있으나, 공식 학과 JSON에는 `ajou`가 없고 `dcu` 대구가톨릭대학교가 포함되어 있습니다.

이 때문에 기본정보 화면에서 사용자가 `아주대학교`를 입력하면 테마는 정상적으로 `ajou`로 바뀌지만, 학과 후보는 공식 데이터 없음 상태로 fallback 처리됩니다.

## 확인 근거

- 프론트 테마 데이터:
  - `docs/design-mockups/quantum_41_frontend_color_tokens_2026-07-04.json`
  - 포함: `ajou`
  - 제외 처리: `dcu`
- 학과 공식 데이터:
  - `docs/research/university-departments/quantum_41_university_departments_2026-07-05.json`
  - 포함: `dcu`
  - 미포함: `ajou`
- 앱 helper:
  - `lib/university-departments.ts`
  - `themeIdsMissingOfficialDepartments: ['ajou']`
  - `officialDepartmentIdsNotInThemeRegistry: ['dcu']`

## 데이터팀 요청 사항

1. 대학알리미 원본 XLSX에서 아주대학교 활성 학과/전공 행을 다시 추출해 주세요.
2. `quantum_41_university_departments_2026-07-05.json`에 `ajou` 항목을 추가하거나, 현재 잘못 들어간 `dcu` 항목을 아주대 항목으로 교체해야 하는지 판단해 주세요.
3. 기준은 기존 데이터와 동일하게 유지해 주세요.
   - 학과상태에 `폐지`가 포함된 행은 제외
   - 기존/신설/변경[신설]/통합[신설]/분리[신설] 등은 활성 학과로 사용
   - 앱 검색 후보는 각 단과대 그룹의 `departmentNamesForAppSearch`에 넣기
4. 수정 후 다음 항목을 보고해 주세요.
   - 아주대 활성 학과/전공 행 수
   - 단과대 그룹 수
   - 제외된 폐지 행 수
   - 샘플 학과 5개
   - `dcu`를 유지해야 하는지 제거해야 하는지

## 현재 앱 처리

아주대 학과 데이터가 보강되기 전까지 앱은 직접입력 fallback으로 동작합니다. 이 fallback은 사용자가 진행을 막히지 않게 하기 위한 임시 안전장치이며, production 승인 전에는 공식 아주대 학과 데이터 연결이 필요합니다.
