-- Migration: public.users 테이블 신설 + auth.users 자동 복제 트리거
-- Owner: 충현
-- Decision: docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md D-10 (옵션 B)
-- Date:   2026-05-21
--
-- 배경:
--   - 기존 profiles.user_id 는 REFERENCES auth.users(id) 였음
--   - 신규 매칭/친구/월드컵 테이블들은 REFERENCES users(id) 로 작성됨
--   - public.users 가 없으면 마이그레이션 적용 자체가 실패함
--   - D-10 결정: public.users 신설 + 모든 응용 FK 를 public.users(id) 로 통일
--
-- 핵심 설계:
--   - public.users.id = auth.users.id (1:1)
--   - auth.users INSERT 시 public.users 자동 추가 (트리거)
--   - auth.users DELETE 시 public.users CASCADE → 응용 테이블 모두 CASCADE
--
-- 본 파일은 20260521 의 다른 마이그레이션보다 먼저 적용되어야 한다.
-- 파일명에 _00_ 를 넣어 알파벳 정렬상 가장 먼저 오게 했다.

-- ─────────────────────────────────────────────
-- public.users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone) WHERE phone IS NOT NULL;

-- ─────────────────────────────────────────────
-- auth.users → public.users 자동 복제 트리거
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─────────────────────────────────────────────
-- 기존 auth.users 데이터 백필 (배포 시 1회)
-- ─────────────────────────────────────────────
INSERT INTO public.users (id, phone)
SELECT id, phone FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 본인 row 만 select
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- service_role 은 전체 접근
CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

COMMENT ON TABLE public.users IS 'auth.users 의 응용 측 사본. 모든 응용 테이블 FK 의 기준점.';
COMMENT ON COLUMN public.users.id IS 'auth.users.id 와 동일. 트리거로 자동 복제.';

-- ─────────────────────────────────────────────
-- 기존 profiles.user_id FK 를 public.users(id) 로 재지정
-- (기존: REFERENCES auth.users(id) → 신규: REFERENCES public.users(id))
-- public.users 가 auth.users 를 CASCADE 참조하므로 동작은 동일하다.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.profiles'::regclass AND attname = 'user_id')
    ];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
END $$;

