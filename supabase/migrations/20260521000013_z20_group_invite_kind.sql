-- Migration: group_invites.invite_kind 컬럼 신설 + link invite phone hack 제거
-- Owner:  충현
-- Decision: route 의 invited_phone='link:...' 임시 처리 해소.
-- Date:   2026-05-21
--
-- 기존 CHECK:
--   CHECK (invited_phone IS NOT NULL OR invited_user_id IS NOT NULL)
--   → link invite 는 둘 다 NULL 이어야 자연스럽지만 CHECK 통과 불가
--   → 임시로 invited_phone = 'link:abcd1234' hack 사용 중
--
-- 새 모델:
--   invite_kind TEXT NOT NULL CHECK (invite_kind IN ('user', 'phone', 'link'))
--   - user:  invited_user_id NOT NULL (특정 가입자 초대)
--   - phone: invited_phone NOT NULL (미가입 phone 초대) AND NOT LIKE 'link:%'
--   - link:  둘 다 NULL 가능 (토큰 기반 공개 링크)
--
-- 변경:
--   1) invite_kind 컬럼 추가 + 기존 row 백필
--   2) 임시 link:xxx 형식 invited_phone 을 NULL 로 정리
--   3) 기존 OR-CHECK 를 invite_kind 기반 CHECK 로 교체

ALTER TABLE group_invites
  ADD COLUMN IF NOT EXISTS invite_kind TEXT;

UPDATE group_invites
SET invite_kind = CASE
  WHEN invited_user_id IS NOT NULL THEN 'user'
  WHEN invited_phone IS NOT NULL AND invited_phone LIKE 'link:%' THEN 'link'
  WHEN invited_phone IS NOT NULL THEN 'phone'
  ELSE 'link'
END
WHERE invite_kind IS NULL;

UPDATE group_invites
SET invited_phone = NULL
WHERE invite_kind = 'link'
  AND invited_phone LIKE 'link:%';

ALTER TABLE group_invites
  ALTER COLUMN invite_kind SET NOT NULL;

ALTER TABLE group_invites
  ADD CONSTRAINT group_invites_invite_kind_chk
    CHECK (invite_kind IN ('user', 'phone', 'link'));

-- 기존 CHECK 해제 (이름 추정으로 시도; 없으면 무시)
DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.group_invites'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%invited_phone IS NOT NULL OR invited_user_id IS NOT NULL%'
  LOOP
    EXECUTE format('ALTER TABLE public.group_invites DROP CONSTRAINT %I', c_name);
  END LOOP;
END $$;

ALTER TABLE group_invites
  ADD CONSTRAINT group_invites_target_chk
    CHECK (
      (invite_kind = 'user'  AND invited_user_id IS NOT NULL)
      OR (invite_kind = 'phone' AND invited_phone IS NOT NULL AND invited_phone NOT LIKE 'link:%')
      OR (invite_kind = 'link')
    );

COMMENT ON COLUMN group_invites.invite_kind IS
  'user (특정 user 초대) / phone (미가입 phone 초대) / link (공개 토큰 링크).';
