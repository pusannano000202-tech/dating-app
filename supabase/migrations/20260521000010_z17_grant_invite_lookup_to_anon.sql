-- Migration: invite token 미리보기 RPC 를 익명 사용자에게도 허용
-- Owner:  충현
-- Decision: invite 페이지에서 로그인 전에 invite 미리보기 가능해야 UX 자연스러움
-- Date:   2026-05-21
--
-- 배경:
--   - z14 에서 get_group_invite_by_token 은 SECURITY DEFINER + authenticated 만 GRANT
--   - invite 링크를 받은 미가입자는 페이지 진입 시 401 → 안내 UX 어색
--   - RPC 는 token 검증되고 pending + not expired 만 반환 → 노출 안전
--
-- 노출 범위:
--   - 노출: invite_id, group_id, group_name, group_size, group_status, invite_status, expires_at
--   - 미노출: invited_user_id, invited_phone, invited_by_user_id (다른 사용자 식별 정보)

GRANT EXECUTE ON FUNCTION public.get_group_invite_by_token(TEXT) TO anon;

COMMENT ON FUNCTION public.get_group_invite_by_token(TEXT) IS
  'token 으로 pending 그룹 invite 의 안전 필드만 반환. anon/authenticated 모두 호출 가능.';
