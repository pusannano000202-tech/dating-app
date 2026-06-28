-- Migration: group_members(user_id) unique 제약을 "현재 활동 중인 그룹" 만 unique 로 완화
-- Owner:  충현 (매칭 마이그레이션 인수자)
-- Decision: Codex 코드리뷰 #9 (CODE_REVIEW_2026-05-21.md)
-- Date:   2026-05-21
--
-- 파일명 prefix 'z' 의 이유:
--   ASCII 상 '_z...' 는 '_matching...' 보다 뒤에 정렬되어,
--   본 마이그레이션이 의존하는 group_members 테이블 생성 이후에 적용됨.
--
-- 배경:
--   기존 20260521_matching_create_core_tables.sql 에서:
--     CREATE UNIQUE INDEX idx_group_members_one_current_group ON group_members(user_id);
--   → 한 사용자가 평생 한 그룹에만 속할 수 있게 됨. 매칭이 끝난 뒤 새 그룹 결성 불가.
--
--   필요한 의미:
--     "한 사용자가 동시에 여러 활동 중 그룹에 속하지 못한다" (forming/ready/in_pool/matched)
--     groups.status 가 completed/disbanded 인 그룹의 history 는 남아도 OK.
--
-- 설계:
--   1) group_members 에 left_at TIMESTAMPTZ NULL 컬럼 추가
--      (사용자가 명시적으로 그룹을 떠나거나 매칭이 끝나 정리될 때 set)
--   2) 기존 unique index 제거
--   3) partial unique: (user_id) WHERE left_at IS NULL
--   4) groups.status 가 completed/disbanded 로 갈 때 group_members.left_at
--      자동 set 트리거
--
-- 영향:
--   - 기존 row 는 left_at NULL 그대로 유지 → 활성 그룹으로 간주
--   - 신규 INSERT 시 left_at 미지정 → 활성으로 시작
--   - 그룹 disbanded/completed 시 자동 left_at = NOW()

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

COMMENT ON COLUMN group_members.left_at IS
  '그룹 이탈 시각. NULL = 활동 중. 활동 중 멤버에 대해서만 user_id unique.';

-- 기존 전체 unique index 제거
DROP INDEX IF EXISTS idx_group_members_one_current_group;

-- partial unique: 활동 중인 멤버에 대해서만 user_id 1회만 등장
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_active_user_unique
  ON group_members(user_id)
  WHERE left_at IS NULL;

-- groups.status 가 종료 상태로 가면 그 그룹의 활성 멤버를 모두 left 처리
CREATE OR REPLACE FUNCTION public.handle_group_terminal_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'disbanded')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE group_members
       SET left_at = NOW()
     WHERE group_id = NEW.id
       AND left_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_groups_close_members ON groups;
CREATE TRIGGER trg_groups_close_members
  AFTER UPDATE OF status ON groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_terminal_status();

COMMENT ON FUNCTION public.handle_group_terminal_status() IS
  '그룹이 completed/disbanded 로 전환되면 해당 그룹의 활성 멤버를 모두 left 처리.';
