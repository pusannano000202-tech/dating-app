-- Migration: matches.status 변화를 groups.status 에 동기화하는 트리거
-- Owner:  충현
-- Decision: 매칭이 confirmed/completed/cancelled 로 갈 때 양쪽 그룹의 status 도
--           자동 갱신되어야 함. 그렇지 않으면 그룹 카드에서 "큐 진입 가능" 같은 잘못된 UI 노출.
-- Date:   2026-05-22
--
-- 동기화 규칙:
--   - matches: pending → confirmed   : 양쪽 groups.status='matched'
--   - matches: confirmed → completed : 양쪽 groups.status='completed'
--   - matches: pending/confirmed → cancelled : 양쪽 groups.status='ready' (재진입 가능 상태)
--                                              단, 그룹이 disbanded 면 변경 안 함
--
-- 예외:
--   - 그룹이 이미 disbanded 면 동기화 안 함
--   - 한 그룹이 여러 매칭에 동시 참여하는 경우는 없음 (그룹당 한 시점 한 매칭만 활성)

CREATE OR REPLACE FUNCTION public.sync_group_status_from_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_group_status TEXT;
BEGIN
  -- INSERT 케이스는 status='pending' 으로 들어오므로 groups.status 변경 없음
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- status 변화 없으면 skip
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- 전이별 목표 group.status 결정
  IF NEW.status = 'confirmed' THEN
    v_new_group_status := 'matched';
  ELSIF NEW.status = 'completed' THEN
    v_new_group_status := 'completed';
  ELSIF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'confirmed') THEN
    v_new_group_status := 'ready';
  ELSE
    -- pending → no_show 같은 변화는 group.status 영향 안 줌
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);

  UPDATE groups
     SET status = v_new_group_status
   WHERE id IN (NEW.group_a_id, NEW.group_b_id)
     AND status <> 'disbanded';

  PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_status_from_match ON matches;
CREATE TRIGGER trg_sync_group_status_from_match
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_group_status_from_match();

-- 기존 데이터 backfill: 활성 매칭의 현재 status 에 맞춰 groups.status 일관화
DO $$
BEGIN
  PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);

  UPDATE groups g
     SET status = 'matched'
   WHERE g.status <> 'disbanded'
     AND g.status <> 'matched'
     AND EXISTS (
       SELECT 1 FROM matches m
        WHERE m.status = 'confirmed'
          AND (m.group_a_id = g.id OR m.group_b_id = g.id)
     );

  UPDATE groups g
     SET status = 'completed'
   WHERE g.status <> 'disbanded'
     AND g.status <> 'completed'
     AND EXISTS (
       SELECT 1 FROM matches m
        WHERE m.status = 'completed'
          AND (m.group_a_id = g.id OR m.group_b_id = g.id)
     );

  PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
END;
$$;

COMMENT ON FUNCTION public.sync_group_status_from_match() IS
  'matches.status 전이 시 양쪽 그룹의 status 를 자동 갱신. disbanded 그룹은 제외.';
