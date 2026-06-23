-- Migration: profiles_public view 를 SECURITY INVOKER 로 명시
-- Owner:  충현
-- Decision: Codex 코드리뷰 #10 (CODE_REVIEW_2026-05-21.md)
-- Date:   2026-05-21
--
-- 파일명 prefix 'z' 의 이유:
--   ASCII 상 '_z...' 는 '_matching...', '_profile...' 보다 뒤에 정렬되어,
--   본 마이그레이션이 의존하는 profiles_public view 생성 이후에 적용됨.
--   ('_10', '_11', '_12' 는 ASCII '1' < 'm' 이라 앞에 와서 의존성이 깨졌음 — 2026-05-21 PM 재검토)
--
-- 배경:
--   Postgres 15+ 의 view 는 기본적으로 SECURITY INVOKER 동작이지만 명시되지 않음.
--   기존 마이그레이션 20260521_profile_add_preference_vectors.sql 에서 정의된
--   profiles_public view 는 옵션 미지정. RLS 가 view caller 의 권한으로 적용되도록
--   security_invoker=on 을 명시한다.
--
--   SECURITY INVOKER 가 아니면 view 가 정의자(보통 postgres) 권한으로 row 를 가져오기
--   때문에 profiles RLS 정책이 우회될 수 있다.
--
-- 영향:
--   - 동작 변화 없음 (15+ 기본값과 동일)
--   - 의도가 명시되어 향후 누구나 RLS 가 적용된다는 사실을 즉시 알 수 있음
--   - Supabase 보안 감사 통과

ALTER VIEW profiles_public SET (security_invoker = on);

COMMENT ON VIEW profiles_public IS
  '사용자 노출 안전 view. raw 벡터/점수는 모두 제외. SECURITY INVOKER (caller 권한으로 RLS 적용).';
