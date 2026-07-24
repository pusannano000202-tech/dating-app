-- z48: Social login support + PNU school email verification
-- Owner: Codex
-- Date: 2026-05-23
--
-- Auth account creation can come from Kakao/Google OAuth, but match participation
-- is gated by a verified Pusan National University email.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS school_email TEXT,
  ADD COLUMN IF NOT EXISTS school_email_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_school_email
  ON public.users (school_email)
  WHERE school_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_verified_school_email
  ON public.users ((lower(school_email)))
  WHERE school_email_verified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.school_email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_email_codes_user_email
  ON public.school_email_verification_codes (user_id, lower(email), created_at DESC);

ALTER TABLE public.school_email_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_email_codes_service_role_all"
  ON public.school_email_verification_codes
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, phone, email)
  VALUES (NEW.id, NEW.phone, NEW.email)
  ON CONFLICT (id) DO UPDATE
    SET phone = COALESCE(EXCLUDED.phone, public.users.phone),
        email = COALESCE(EXCLUDED.email, public.users.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

INSERT INTO public.users (id, phone, email)
SELECT id, phone, email FROM auth.users
ON CONFLICT (id) DO UPDATE
  SET phone = COALESCE(EXCLUDED.phone, public.users.phone),
      email = COALESCE(EXCLUDED.email, public.users.email);

CREATE OR REPLACE FUNCTION public.request_school_email_verification(
  p_email TEXT,
  p_code_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT := lower(trim(p_email));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_email !~ '^[^@[:space:]]+@pusan\.ac\.kr$' THEN
    RAISE EXCEPTION 'invalid_school_email';
  END IF;

  INSERT INTO public.school_email_verification_codes (
    user_id,
    email,
    code_hash,
    expires_at
  )
  VALUES (
    v_user_id,
    v_email,
    p_code_hash,
    p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_school_email_code(
  p_email TEXT,
  p_code_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT := lower(trim(p_email));
  v_code public.school_email_verification_codes%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_code
  FROM public.school_email_verification_codes
  WHERE user_id = v_user_id
    AND lower(email) = v_email
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_code.expires_at < NOW() OR v_code.attempts >= 5 THEN
    RETURN FALSE;
  END IF;

  IF v_code.code_hash <> p_code_hash THEN
    UPDATE public.school_email_verification_codes
    SET attempts = attempts + 1
    WHERE id = v_code.id;
    RETURN FALSE;
  END IF;

  UPDATE public.school_email_verification_codes
  SET consumed_at = NOW()
  WHERE id = v_code.id;

  UPDATE public.users
  SET school_email = v_email,
      school_email_verified_at = NOW()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.request_school_email_verification(TEXT, TEXT, TIMESTAMPTZ) FROM ' || 'PUBLIC';
END $$;
GRANT EXECUTE ON FUNCTION public.verify_school_email_code(TEXT, TEXT) TO authenticated;

COMMENT ON COLUMN public.users.email IS 'Auth provider email copied from auth.users when available.';
COMMENT ON COLUMN public.users.school_email IS 'Verified Pusan National University email used for school eligibility.';
COMMENT ON COLUMN public.users.school_email_verified_at IS 'Non-null only after PNU email verification succeeds.';
