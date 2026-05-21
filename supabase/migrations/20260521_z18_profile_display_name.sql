-- Migration: profiles.display_name 컬럼 추가 + profiles_public view 갱신
-- Owner:  충현
-- Decision: 그룹/친구 UI 에서 "친구 abcd1234" placeholder 제거 필요
-- Date:   2026-05-21
--
-- 노출 범위:
--   - display_name 은 매칭 전에도 친구/그룹 멤버 사이에서 공유되는 가벼운 이름
--   - 실명/별명 모두 허용. 사진/외모 점수와는 별개의 안전 필드
--
-- 기존 view 컬럼은 유지하고 display_name 만 추가한다.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN profiles.display_name IS
  '친구/그룹 멤버 사이에서 공유되는 이름. 실명 또는 별명. 사용자 노출 안전.';

DROP VIEW IF EXISTS profiles_public;

CREATE VIEW profiles_public WITH (security_invoker = on) AS
SELECT
  user_id,
  display_name,
  gender,
  age,
  height,
  body_type,
  hair_density,
  school,
  department,
  year,
  appearance_type,
  preferred_bucket_weights,
  worldcup_completed_at,
  is_profile_complete,
  updated_at
FROM profiles;

COMMENT ON VIEW profiles_public IS
  '사용자 노출 안전 view. raw 벡터/점수 제외. SECURITY INVOKER (caller 권한으로 RLS 적용).';
