# Community Voice 원본 보존 감사

검사일: 2026-09-07  
범위: `.tmp/community-voice-baseline/manifest.json`에 기록된 파일만

## 결론

가져온 원본 756개 중 대상 작업공간에서 삭제된 파일은 0개다. 최종 부모 재검사에서 대상 작업공간은 G1–G9 통합 작업으로 48개 파일의 내용이 기준 해시와 달라졌고, 나머지 708개는 기준 해시와 같다. 읽기 전용 원본 작업공간은 756개 모두 기준 해시와 같고 누락도 없다.

이 결과는 **파일 보존 감사**다. DB 데이터, Supabase Storage 객체, 원격 migration 적용 상태, Vercel 배포, 실제 계정·결제·기기 동작의 보존을 증명하지 않는다.

## 기준과 검사 방법

| 항목 | 값 |
| --- | --- |
| 원본 | `C:\Users\82108\.config\superpowers\worktrees\데이팅앱만들기\integrated-campus-20260905` |
| 대상 | `C:\Users\82108\.config\superpowers\worktrees\데이팅앱만들기\community-voice-20260907` |
| 원본 HEAD 기록 | `be9078565d8e59f73cbc017f3c7b1484996da1c3` |
| 스냅샷 생성 시각 | `2026-09-06T17:07:22.040Z` (`2026-09-07 02:07:22 KST`) |
| 기준 파일 수 | 756 |
| 검사 | 각 manifest 경로의 존재 여부와 SHA-256을 대상·원본 양쪽에서 재계산 |

## 전체 결과

| 검사 대상 | 해시 일치 | 해시 변경 | 파일 누락 |
| --- | ---: | ---: | ---: |
| 대상 작업공간 | 708 | 48 | 0 |
| 읽기 전용 원본 작업공간 | 756 | 0 | 0 |

48개 변경은 기준 파일이 사라졌다는 뜻이 아니라, 스냅샷을 가져온 뒤 현재 통합 작업에서 내용이 바뀌었다는 뜻이다. 이 감사는 각 변경의 제품 적합성까지 승인하지 않는다.

## 대표 기존 기능 보존 확인

아래 파일은 대상 작업공간의 현재 SHA-256이 manifest와 정확히 같았다.

| 보호 기능 | 확인 파일 | 결과 |
| --- | --- | --- |
| MBTI 진입·여정 | `app/community/mbti/page.tsx`, `lib/community/mbti/journey.ts` | 2/2 일치 |
| 배달 화면·로컬 보존 | `app/(campus-eats)/community/campus-eats/delivery/page.tsx`, `lib/campus-eats/preserved-storage.ts` | 2/2 일치 |
| 여성 쇼핑·남성 활동·혼합 모임 추천 | `lib/community/social-meetup-discovery.ts` | 일치 |
| Day 안내·5회 계속 만남 콘텐츠 | `lib/matching/continuation-content-guide.ts`, `lib/matching/five-meeting-content.ts` | 2/2 일치 |

## 판정 경계

- 확인됨: 기준 756개 경로의 대상 삭제 0개, 원본 작업공간 변경·누락 0개, 위 대표 7개 파일의 내용 동일.
- 별도 검토 필요: 기준 대비 변경된 48개 파일 각각의 기능·보안 적합성.
- 미검증: 원격 DB/Storage/Auth 데이터, 실제 배포 산출물, 외부 API 연결, 실계정·실결제·실기기 회귀.
- 비밀값은 읽거나 기록하지 않았고, Git·DB·원격 서비스 상태를 변경하지 않았다.
