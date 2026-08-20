# 대학별 학과 데이터 원본

이 폴더의 XLSX는 Quantum 59개 학교 학과 검색 목록을 재생성하고 검증하기 위한 고정 원본이다. 브라우저가 직접 내려받는 런타임 에셋은 아니며, 앱에서는 `public/university-departments/*.json`만 사용한다.

| 항목 | 값 |
|---|---|
| 원본 제목 | 학교별 교육편제단위 정보_20241007기준.xlsx |
| 파일명 | `academyinfo_school_education_units_20241007.xlsx` |
| 제공 기관 | 대학알리미 |
| 데이터 기준일 | 2024-10-07 |
| SHA-256 | `C47323B0E9F2A5D4BF017597968DF533AB4F6EBFF64B702411DECC4974E6A3B6` |
| 대학알리미 자료실 | https://www.academyinfo.go.kr/brd/brd0520/selectDetail.do?ntce_sntc_sno=160&bbs_gubun=rfbr&no=19 |
| 공공데이터포털 보조 출처 | https://www.data.go.kr/data/15139338/fileData.do?recommendDataYn=Y |

## 재생성과 검증

- 생성: `py -3 scripts/generate_university_department_catalogs.py`
- 검증: `py -3 scripts/generate_university_department_catalogs.py --check`
- 생성기는 파일 해시, 압축 파일 수, 개별 압축 해제 크기, 전체 압축 해제 크기를 먼저 검사한다.
- 원본이 갱신되면 파일만 교체하지 말고 출처·기준일·해시·생성 결과를 함께 검수해야 한다.
