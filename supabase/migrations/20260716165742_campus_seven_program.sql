-- Quantum Campus Seven: server-owned seven-day campus dating program.
-- This migration only creates the contract. It does not open applications,
-- charge deposits, or enable the 1,000 won card checkout.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE public.campus_seven_program_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  pilot_school TEXT,
  applications_open BOOLEAN NOT NULL DEFAULT FALSE,
  card_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_active_cohorts INT NOT NULL DEFAULT 1 CHECK (max_active_cohorts = 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.campus_seven_program_settings (singleton)
VALUES (TRUE);

CREATE TABLE public.campus_seven_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'running', 'completed', 'cancelled')),
  start_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul' CHECK (timezone = 'Asia/Seoul'),
  meeting_point_name TEXT NOT NULL,
  meeting_point_address TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 8 CHECK (capacity = 8),
  activity_budget_cap_won INT NOT NULL DEFAULT 100000 CHECK (activity_budget_cap_won = 100000),
  refundable_deposit_won INT NOT NULL DEFAULT 50000 CHECK (refundable_deposit_won = 50000),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school, start_date)
);

CREATE TABLE public.campus_seven_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'identity_review', 'eligible', 'waitlisted', 'accepted', 'withdrawn', 'rejected')),
  preference_answers JSONB NOT NULL CHECK (jsonb_typeof(preference_answers) = 'object'),
  consent_version TEXT NOT NULL,
  required_consents JSONB NOT NULL CHECK (jsonb_typeof(required_consents) = 'object'),
  card_sale_preference BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campus_seven_private_profiles (
  application_id UUID PRIMARY KEY REFERENCES public.campus_seven_applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  submitted_name TEXT NOT NULL CHECK (char_length(btrim(submitted_name)) BETWEEN 2 AND 50),
  verified_name TEXT,
  date_of_birth DATE NOT NULL,
  department_snapshot TEXT,
  identity_verified_at TIMESTAMPTZ,
  identity_verification_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (identity_verified_at IS NULL OR verified_name IS NOT NULL)
);

CREATE TABLE public.campus_seven_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  application_id UUID NOT NULL UNIQUE REFERENCES public.campus_seven_applications(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (char_length(btrim(alias)) BETWEEN 2 AND 20),
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  entry_role TEXT NOT NULL CHECK (entry_role IN ('starter', 'newcomer')),
  joined_day INT NOT NULL CHECK (joined_day IN (1, 2)),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'withdrawn', 'safety_withdrawn', 'removed')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  UNIQUE (cohort_id, user_id),
  UNIQUE (cohort_id, alias)
);

CREATE UNIQUE INDEX campus_seven_one_active_enrollment_per_user
  ON public.campus_seven_enrollments(user_id)
  WHERE status = 'active';

CREATE TABLE public.campus_seven_daily_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  day_number INT NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  meeting_mode TEXT NOT NULL CHECK (meeting_mode IN ('campus_then_venue', 'direct_to_venue')),
  budget_won INT NOT NULL CHECK (budget_won > 0 AND budget_won <= 20000),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reservation_deadline TIMESTAMPTZ NOT NULL,
  venue_name TEXT,
  venue_address TEXT,
  venue_booking_url TEXT,
  venue_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (venue_status IN ('pending', 'confirmed', 'fallback_required', 'cancelled')),
  allowed_menu_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_id, day_number),
  CHECK (ends_at > starts_at)
);

CREATE TABLE public.campus_seven_reservation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL UNIQUE REFERENCES public.campus_seven_daily_schedules(id) ON DELETE CASCADE,
  assignee_enrollment_id UUID NOT NULL REFERENCES public.campus_seven_enrollments(id) ON DELETE RESTRICT,
  backup_enrollment_id UUID REFERENCES public.campus_seven_enrollments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'venue_unavailable', 'substitute_requested', 'cancelled')),
  reminders_sent INT NOT NULL DEFAULT 0 CHECK (reminders_sent BETWEEN 0 AND 3),
  attempted_at TIMESTAMPTZ,
  confirmation_reference TEXT,
  no_action_detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campus_seven_deposit_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_won INT NOT NULL DEFAULT 50000 CHECK (amount_won = 50000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'release_pending', 'released', 'forfeit_review', 'cancelled')),
  provider TEXT,
  provider_payment_key TEXT,
  paid_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_id, user_id)
);

CREATE TABLE public.campus_seven_attendance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.campus_seven_daily_schedules(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.campus_seven_enrollments(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL UNIQUE,
  watermark_text TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  participant_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'verified', 'rejected', 'deleted')),
  delete_after TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, enrollment_id)
);

CREATE TABLE public.campus_seven_interest_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  day_number INT NOT NULL CHECK (day_number IN (1, 3, 5)),
  voter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  positive_reason TEXT NOT NULL CHECK (char_length(btrim(positive_reason)) BETWEEN 2 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (voter_user_id <> target_user_id),
  UNIQUE (cohort_id, day_number, voter_user_id)
);

CREATE TABLE public.campus_seven_day_two_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  newcomer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  choice_rank INT NOT NULL CHECK (choice_rank IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (newcomer_user_id <> target_user_id),
  UNIQUE (cohort_id, newcomer_user_id, choice_rank),
  UNIQUE (cohort_id, newcomer_user_id, target_user_id)
);

CREATE TABLE public.campus_seven_day_two_teams (
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  team_code TEXT NOT NULL CHECK (team_code IN ('A', 'B')),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cohort_id, team_code, user_id),
  UNIQUE (cohort_id, user_id)
);

CREATE TABLE public.campus_seven_day_four_teams (
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  team_code TEXT NOT NULL CHECK (team_code IN ('A', 'B', 'C', 'D')),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cohort_id, team_code, user_id),
  UNIQUE (cohort_id, user_id)
);

CREATE TABLE public.campus_seven_game_rank_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL CHECK (game_name IN ('윷놀이', '할리갈리', '우노', '다빈치 코드', '루미큐브')),
  team_code TEXT NOT NULL CHECK (team_code IN ('A', 'B', 'C', 'D')),
  submitted_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_id, game_name, team_code)
);

CREATE TABLE public.campus_seven_game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL CHECK (game_name IN ('윷놀이', '할리갈리', '우노', '다빈치 코드', '루미큐브')),
  team_code TEXT NOT NULL CHECK (team_code IN ('A', 'B', 'C', 'D')),
  rank INT NOT NULL CHECK (rank BETWEEN 1 AND 4),
  points INT NOT NULL CHECK (points BETWEEN 1 AND 4 AND points = 5 - rank),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_id, game_name, team_code),
  UNIQUE (cohort_id, game_name, rank)
);

CREATE TABLE public.campus_seven_date_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  chooser_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  selection_round INT NOT NULL DEFAULT 1 CHECK (selection_round BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'safety_withdrawn')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (chooser_user_id <> target_user_id),
  UNIQUE (cohort_id, chooser_user_id, selection_round)
);

CREATE UNIQUE INDEX campus_seven_one_open_date_choice_per_chooser
  ON public.campus_seven_date_choices(cohort_id, chooser_user_id)
  WHERE status IN ('pending', 'accepted');

CREATE UNIQUE INDEX campus_seven_one_accepted_date_per_target
  ON public.campus_seven_date_choices(cohort_id, target_user_id)
  WHERE status = 'accepted';

CREATE TABLE public.campus_seven_final_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  proposer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  response TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending', 'accepted', 'rejected')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (proposer_user_id <> target_user_id),
  UNIQUE (cohort_id, proposer_user_id)
);

CREATE UNIQUE INDEX campus_seven_one_accepted_final_pair_per_target
  ON public.campus_seven_final_choices(cohort_id, target_user_id)
  WHERE response = 'accepted';

CREATE TABLE public.campus_seven_safety_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE RESTRICT,
  reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('harassment', 'stalking', 'contact_request', 'threat', 'intoxication', 'emergency', 'other')),
  detail TEXT NOT NULL CHECK (char_length(btrim(detail)) BETWEEN 2 AND 1000),
  safety_exit_requested BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE public.campus_seven_deposit_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  source_reservation_task_id UUID UNIQUE REFERENCES public.campus_seven_reservation_tasks(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (reason IN ('reservation_no_action', 'unexcused_no_show')),
  amount_won INT NOT NULL CHECK (amount_won IN (10000, 50000)),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'appealed', 'approved', 'rejected', 'cancelled')),
  appeal_deadline TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  appeal_text TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campus_seven_card_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  previewed_at TIMESTAMPTZ,
  sale_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sale_consent_version TEXT,
  sale_consented_at TIMESTAMPTZ,
  sales_open_at TIMESTAMPTZ,
  sales_close_at TIMESTAMPTZ,
  delete_after TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_id, owner_user_id),
  CHECK (sale_enabled = FALSE OR (previewed_at IS NOT NULL AND sale_consented_at IS NOT NULL)),
  CHECK (sales_close_at IS NULL OR sales_open_at IS NOT NULL),
  CHECK (delete_after IS NULL OR sales_close_at IS NOT NULL)
);

CREATE TABLE public.campus_seven_card_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.campus_seven_cohorts(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  price_won INT NOT NULL DEFAULT 1000 CHECK (price_won = 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  provider TEXT,
  provider_payment_key TEXT,
  purchased_at TIMESTAMPTZ,
  access_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (owner_user_id <> buyer_user_id),
  CHECK (status <> 'paid' OR (purchased_at IS NOT NULL AND access_expires_at = purchased_at + INTERVAL '24 hours')),
  UNIQUE (cohort_id, owner_user_id, buyer_user_id)
);

CREATE INDEX campus_seven_enrollments_cohort_idx ON public.campus_seven_enrollments(cohort_id, status);
CREATE INDEX campus_seven_schedules_cohort_day_idx ON public.campus_seven_daily_schedules(cohort_id, day_number);
CREATE INDEX campus_seven_interest_votes_cohort_day_idx ON public.campus_seven_interest_votes(cohort_id, day_number);
CREATE INDEX campus_seven_reports_reporter_idx ON public.campus_seven_safety_reports(reporter_user_id, created_at DESC);
CREATE INDEX campus_seven_attendance_delete_idx ON public.campus_seven_attendance_evidence(delete_after) WHERE deleted_at IS NULL;
CREATE INDEX campus_seven_card_access_idx ON public.campus_seven_card_purchases(buyer_user_id, access_expires_at) WHERE status = 'paid';
CREATE UNIQUE INDEX campus_seven_one_no_show_review_per_user
  ON public.campus_seven_deposit_reviews(cohort_id, user_id)
  WHERE reason = 'unexcused_no_show';

ALTER TABLE public.campus_seven_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_private_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_daily_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_reservation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_deposit_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_attendance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_interest_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_day_two_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_day_two_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_day_four_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_game_rank_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_date_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_final_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_deposit_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_card_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_card_purchases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.campus_seven_cohorts FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_program_settings FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_applications FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_enrollments FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_private_profiles FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_daily_schedules FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_reservation_tasks FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_deposit_holds FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_attendance_evidence FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_interest_votes FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_day_two_choices FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_day_two_teams FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_day_four_teams FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_game_rank_submissions FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_game_results FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_date_choices FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_final_choices FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_safety_reports FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_deposit_reviews FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_card_publications FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_card_purchases FROM anon, authenticated;

GRANT ALL ON public.campus_seven_cohorts TO service_role;
GRANT ALL ON public.campus_seven_program_settings TO service_role;
GRANT ALL ON public.campus_seven_applications TO service_role;
GRANT ALL ON public.campus_seven_enrollments TO service_role;
GRANT ALL ON public.campus_seven_private_profiles TO service_role;
GRANT ALL ON public.campus_seven_daily_schedules TO service_role;
GRANT ALL ON public.campus_seven_reservation_tasks TO service_role;
GRANT ALL ON public.campus_seven_deposit_holds TO service_role;
GRANT ALL ON public.campus_seven_attendance_evidence TO service_role;
GRANT ALL ON public.campus_seven_interest_votes TO service_role;
GRANT ALL ON public.campus_seven_day_two_choices TO service_role;
GRANT ALL ON public.campus_seven_day_two_teams TO service_role;
GRANT ALL ON public.campus_seven_day_four_teams TO service_role;
GRANT ALL ON public.campus_seven_game_rank_submissions TO service_role;
GRANT ALL ON public.campus_seven_game_results TO service_role;
GRANT ALL ON public.campus_seven_date_choices TO service_role;
GRANT ALL ON public.campus_seven_final_choices TO service_role;
GRANT ALL ON public.campus_seven_safety_reports TO service_role;
GRANT ALL ON public.campus_seven_deposit_reviews TO service_role;
GRANT ALL ON public.campus_seven_card_publications TO service_role;
GRANT ALL ON public.campus_seven_card_purchases TO service_role;

CREATE POLICY campus_seven_applications_service_all ON public.campus_seven_applications
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY campus_seven_private_profiles_service_all ON public.campus_seven_private_profiles
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY campus_seven_reports_service_all ON public.campus_seven_safety_reports
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campus-seven-attendance',
  'campus-seven-attendance',
  FALSE,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS campus_seven_attendance_insert_own ON storage.objects;
CREATE POLICY campus_seven_attendance_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campus-seven-attendance'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS campus_seven_attendance_select_own ON storage.objects;
CREATE POLICY campus_seven_attendance_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campus-seven-attendance'
    AND owner_id = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS campus_seven_attendance_delete_own ON storage.objects;
CREATE POLICY campus_seven_attendance_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campus-seven-attendance'
    AND owner_id = (SELECT auth.uid())::TEXT
  );

CREATE OR REPLACE FUNCTION private.campus_seven_has_prohibited_contact(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_value, '') ~* '(^|[^0-9])01[016789][ .-]*[0-9]{3,4}[ .-]*[0-9]{4}([^0-9]|$)'
      OR COALESCE(p_value, '') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
      OR COALESCE(p_value, '') ~* '(^|[[:space:]])@[A-Z0-9._-]{2,}'
      OR COALESCE(p_value, '') ~* '(카[[:space:]]*톡|카카오[[:space:]]*톡|오픈[[:space:]]*채팅|인스타|인스타그램|텔레그램|라인[[:space:]]*아이디|디엠|DM)';
$$;

CREATE OR REPLACE FUNCTION public.form_campus_seven_cohort(
  p_school TEXT,
  p_start_date DATE,
  p_meeting_point_name TEXT,
  p_meeting_point_address TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cohort_id UUID;
  v_men UUID[];
  v_women UUID[];
  v_selected UUID[];
  v_pilot_school TEXT;
  v_max_active_cohorts INT;
BEGIN
  IF char_length(btrim(COALESCE(p_school, ''))) < 2
    OR char_length(btrim(COALESCE(p_meeting_point_name, ''))) < 2
    OR char_length(btrim(COALESCE(p_meeting_point_address, ''))) < 2 THEN
    RAISE EXCEPTION 'cohort_location_required';
  END IF;
  IF p_start_date < (NOW() AT TIME ZONE 'Asia/Seoul')::DATE + 3 THEN
    RAISE EXCEPTION 'cohort_lead_time_required';
  END IF;

  SELECT settings.pilot_school, settings.max_active_cohorts
  INTO v_pilot_school, v_max_active_cohorts
  FROM public.campus_seven_program_settings AS settings
  WHERE settings.singleton = TRUE;
  IF v_pilot_school IS NULL OR btrim(p_school) <> v_pilot_school THEN
    RAISE EXCEPTION 'pilot_school_not_approved';
  END IF;
  IF (
    SELECT COUNT(*) FROM public.campus_seven_cohorts AS cohort
    WHERE cohort.status IN ('draft', 'ready', 'running')
  ) >= v_max_active_cohorts THEN
    RAISE EXCEPTION 'pilot_cohort_limit_reached';
  END IF;

  SELECT array_agg(candidate.id ORDER BY candidate.applied_at)
  INTO v_men
  FROM (
    SELECT application.id, application.applied_at
    FROM public.campus_seven_applications AS application
    JOIN public.campus_seven_private_profiles AS private_profile
      ON private_profile.application_id = application.id
    WHERE application.school = btrim(p_school)
      AND application.gender = 'male'
      AND application.status = 'eligible'
      AND private_profile.identity_verified_at IS NOT NULL
      AND private_profile.verified_name IS NOT NULL
      AND application.required_consents @> '{"cohort_photo_display": true}'::jsonb
      AND EXISTS (
        SELECT 1
        FROM public.photos AS profile_photo
        WHERE profile_photo.user_id = application.user_id
          AND profile_photo.sort_order = 0
          AND NULLIF(btrim(profile_photo.public_url), '') IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.campus_seven_enrollments AS enrollment
        WHERE enrollment.application_id = application.id
      )
    ORDER BY application.applied_at
    LIMIT 4
    FOR UPDATE OF application SKIP LOCKED
  ) AS candidate;

  SELECT array_agg(candidate.id ORDER BY candidate.applied_at)
  INTO v_women
  FROM (
    SELECT application.id, application.applied_at
    FROM public.campus_seven_applications AS application
    JOIN public.campus_seven_private_profiles AS private_profile
      ON private_profile.application_id = application.id
    WHERE application.school = btrim(p_school)
      AND application.gender = 'female'
      AND application.status = 'eligible'
      AND private_profile.identity_verified_at IS NOT NULL
      AND private_profile.verified_name IS NOT NULL
      AND application.required_consents @> '{"cohort_photo_display": true}'::jsonb
      AND EXISTS (
        SELECT 1
        FROM public.photos AS profile_photo
        WHERE profile_photo.user_id = application.user_id
          AND profile_photo.sort_order = 0
          AND NULLIF(btrim(profile_photo.public_url), '') IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.campus_seven_enrollments AS enrollment
        WHERE enrollment.application_id = application.id
      )
    ORDER BY application.applied_at
    LIMIT 4
    FOR UPDATE OF application SKIP LOCKED
  ) AS candidate;

  IF COALESCE(array_length(v_men, 1), 0) <> 4
    OR COALESCE(array_length(v_women, 1), 0) <> 4 THEN
    RAISE EXCEPTION 'eight_verified_participants_required';
  END IF;
  v_selected := v_men || v_women;

  INSERT INTO public.campus_seven_cohorts (
    school, status, start_date, meeting_point_name, meeting_point_address
  ) VALUES (
    btrim(p_school), 'draft', p_start_date,
    btrim(p_meeting_point_name), btrim(p_meeting_point_address)
  )
  RETURNING id INTO v_cohort_id;

  WITH selected AS (
    SELECT
      application.id AS application_id,
      application.user_id,
      application.gender,
      application.applied_at,
      ROW_NUMBER() OVER (
        PARTITION BY application.gender ORDER BY application.applied_at, application.id
      ) AS gender_position,
      ROW_NUMBER() OVER (
        ORDER BY application.gender, application.applied_at, application.id
      ) AS overall_position,
      profile.display_name
    FROM public.campus_seven_applications AS application
    LEFT JOIN public.profiles AS profile ON profile.user_id = application.user_id
    WHERE application.id = ANY(v_selected)
  )
  INSERT INTO public.campus_seven_enrollments (
    cohort_id, application_id, user_id, alias, gender, entry_role, joined_day
  )
  SELECT
    v_cohort_id,
    selected.application_id,
    selected.user_id,
    left(COALESCE(NULLIF(btrim(selected.display_name), ''), format('참가자 %s', selected.overall_position)), 20),
    selected.gender,
    CASE WHEN selected.gender_position = 4 THEN 'newcomer' ELSE 'starter' END,
    CASE WHEN selected.gender_position = 4 THEN 2 ELSE 1 END
  FROM selected;

  UPDATE public.campus_seven_applications
  SET status = 'accepted', updated_at = NOW()
  WHERE id = ANY(v_selected);

  INSERT INTO public.campus_seven_deposit_holds (cohort_id, user_id, amount_won, status)
  SELECT v_cohort_id, enrollment.user_id, 50000, 'pending'
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.cohort_id = v_cohort_id;

  INSERT INTO public.campus_seven_daily_schedules (
    cohort_id, day_number, title, summary, meeting_mode, budget_won,
    starts_at, ends_at, reservation_deadline, allowed_menu_note
  )
  SELECT
    v_cohort_id,
    day.day_number,
    CASE day.day_number
      WHEN 1 THEN '첫 만남과 저녁'
      WHEN 2 THEN '새로운 두 사람'
      WHEN 3 THEN '자리 바꾸는 저녁'
      WHEN 4 THEN '보드게임 팀전'
      WHEN 5 THEN '서로를 더 알기'
      WHEN 6 THEN '특별 데이트'
      ELSE '마지막 저녁'
    END,
    CASE day.day_number
      WHEN 1 THEN '3대3 식사와 한 시간 뒤 비공개 관심 선택'
      WHEN 2 THEN '신규 참가자 합류와 2남2녀 두 팀 식사'
      WHEN 3 THEN '음식 중심 일반 주점에서 자리 순환과 관심 선택'
      WHEN 4 THEN '네 개의 혼성 팀이 다섯 게임으로 경쟁'
      WHEN 5 THEN '우승팀 미션 데이트와 3대3 취향추리 카페'
      WHEN 6 THEN '최다 득표 참가자의 상호 동의 특별 데이트'
      ELSE '자리 순환, 비공개 제안과 최종 선택'
    END,
    CASE WHEN day.day_number IN (1, 3, 4, 7) THEN 'campus_then_venue' ELSE 'direct_to_venue' END,
    (ARRAY[12000, 12000, 18000, 10000, 10000, 15000, 20000])[day.day_number],
    ((p_start_date + (day.day_number - 1))::DATE + TIME '19:00') AT TIME ZONE 'Asia/Seoul',
    ((p_start_date + (day.day_number - 1))::DATE
      + CASE WHEN day.day_number = 7 THEN TIME '23:00' ELSE TIME '22:00' END) AT TIME ZONE 'Asia/Seoul',
    ((p_start_date + (day.day_number - 2))::DATE + TIME '17:00') AT TIME ZONE 'Asia/Seoul',
    CASE WHEN day.day_number = 3 THEN '음식 중심, 음주 금지' ELSE '음주 금지, 1인 상한 준수' END
  FROM generate_series(1, 7) AS day(day_number);

  WITH ordered_enrollments AS (
    SELECT enrollment.id,
      ROW_NUMBER() OVER (ORDER BY enrollment.joined_day, enrollment.gender, enrollment.enrolled_at, enrollment.id) AS position
    FROM public.campus_seven_enrollments AS enrollment
    WHERE enrollment.cohort_id = v_cohort_id
  )
  INSERT INTO public.campus_seven_reservation_tasks (
    schedule_id, assignee_enrollment_id, backup_enrollment_id
  )
  SELECT schedule.id, assignee.id, backup.id
  FROM public.campus_seven_daily_schedules AS schedule
  JOIN ordered_enrollments AS assignee
    ON assignee.position = ((schedule.day_number - 1) % 8) + 1
  JOIN ordered_enrollments AS backup
    ON backup.position = (schedule.day_number % 8) + 1
  WHERE schedule.cohort_id = v_cohort_id;

  WITH men AS (
    SELECT enrollment.user_id,
      ROW_NUMBER() OVER (ORDER BY enrollment.joined_day, enrollment.enrolled_at, enrollment.id) AS pair_number
    FROM public.campus_seven_enrollments AS enrollment
    WHERE enrollment.cohort_id = v_cohort_id AND enrollment.gender = 'male'
  ), women AS (
    SELECT enrollment.user_id,
      ROW_NUMBER() OVER (ORDER BY enrollment.joined_day, enrollment.enrolled_at, enrollment.id) AS pair_number
    FROM public.campus_seven_enrollments AS enrollment
    WHERE enrollment.cohort_id = v_cohort_id AND enrollment.gender = 'female'
  ), paired AS (
    SELECT men.user_id, men.pair_number FROM men
    UNION ALL
    SELECT women.user_id, women.pair_number FROM women
  )
  INSERT INTO public.campus_seven_day_four_teams (cohort_id, team_code, user_id)
  SELECT v_cohort_id, chr(64 + paired.pair_number::INT), paired.user_id
  FROM paired;

  RETURN v_cohort_id;
END;
$$;

REVOKE ALL ON FUNCTION public.form_campus_seven_cohort(TEXT, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.form_campus_seven_cohort(TEXT, DATE, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.form_campus_seven_cohort(TEXT, DATE, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.form_campus_seven_cohort(TEXT, DATE, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_campus_seven_cohort_ready(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT cohort.status INTO v_status
  FROM public.campus_seven_cohorts AS cohort
  WHERE cohort.id = p_cohort_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cohort_not_found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'cohort_not_draft'; END IF;

  IF (SELECT COUNT(*) FROM public.campus_seven_enrollments AS enrollment
      WHERE enrollment.cohort_id = p_cohort_id AND enrollment.status = 'active') <> 8 THEN
    RAISE EXCEPTION 'eight_active_participants_required';
  END IF;
  IF (SELECT COUNT(*) FROM public.campus_seven_deposit_holds AS deposit
      WHERE deposit.cohort_id = p_cohort_id) <> 8
    OR EXISTS (
      SELECT 1 FROM public.campus_seven_deposit_holds AS deposit
      WHERE deposit.cohort_id = p_cohort_id AND deposit.status <> 'paid'
    ) THEN
    RAISE EXCEPTION 'all_deposits_must_be_paid';
  END IF;
  IF (SELECT COUNT(*) FROM public.campus_seven_daily_schedules AS schedule
      WHERE schedule.cohort_id = p_cohort_id) <> 7
    OR EXISTS (
      SELECT 1 FROM public.campus_seven_daily_schedules AS schedule
      WHERE schedule.cohort_id = p_cohort_id
        AND (schedule.venue_status <> 'confirmed'
          OR schedule.venue_name IS NULL OR schedule.venue_address IS NULL)
    ) THEN
    RAISE EXCEPTION 'seven_confirmed_venues_required';
  END IF;

  UPDATE public.campus_seven_cohorts
  SET status = 'ready', updated_at = NOW()
  WHERE id = p_cohort_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_campus_seven_cohort_ready(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_campus_seven_cohort_ready(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.mark_campus_seven_cohort_ready(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_campus_seven_cohort_ready(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_campus_seven_cohorts()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.campus_seven_cohorts
  SET status = 'running', updated_at = NOW()
  WHERE status = 'ready'
    AND start_date <= (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_campus_seven_cohorts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_campus_seven_cohorts() FROM anon;
REVOKE ALL ON FUNCTION public.activate_campus_seven_cohorts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_campus_seven_cohorts() TO service_role;

CREATE OR REPLACE FUNCTION public.apply_to_campus_seven(
  p_submitted_name TEXT,
  p_date_of_birth DATE,
  p_preference_answers JSONB,
  p_required_consents JSONB,
  p_card_sale_preference BOOLEAN DEFAULT FALSE,
  p_consent_version TEXT DEFAULT 'campus-seven-v2'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_school TEXT;
  v_department TEXT;
  v_gender TEXT;
  v_school_verified_at TIMESTAMPTZ;
  v_application_id UUID;
  v_answer_count INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT COALESCE((
    SELECT settings.applications_open
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) THEN
    RAISE EXCEPTION 'application_window_closed';
  END IF;

  SELECT p.school, p.department, p.gender, u.school_email_verified_at
  INTO v_school, v_department, v_gender, v_school_verified_at
  FROM public.profiles AS p
  JOIN public.users AS u ON u.id = p.user_id
  WHERE p.user_id = v_caller;

  IF v_school IS NULL OR v_gender IS NULL THEN
    RAISE EXCEPTION 'complete_profile_required';
  END IF;
  IF v_school_verified_at IS NULL THEN
    RAISE EXCEPTION 'school_verification_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.photos AS profile_photo
    WHERE profile_photo.user_id = v_caller
      AND profile_photo.sort_order = 0
      AND NULLIF(btrim(profile_photo.public_url), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'profile_photo_required';
  END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth > CURRENT_DATE - INTERVAL '19 years' THEN
    RAISE EXCEPTION 'adult_only';
  END IF;
  IF char_length(btrim(COALESCE(p_submitted_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF jsonb_typeof(p_preference_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_preference_answers';
  END IF;

  SELECT COUNT(*) INTO v_answer_count FROM jsonb_each(p_preference_answers);
  IF v_answer_count <> 8 OR EXISTS (
    SELECT 1
    FROM jsonb_each(p_preference_answers) AS answer(key, value)
    WHERE jsonb_typeof(answer.value) <> 'string'
      OR char_length(btrim(answer.value #>> '{}')) NOT BETWEEN 1 AND 80
      OR private.campus_seven_has_prohibited_contact(answer.value #>> '{}')
  ) THEN
    RAISE EXCEPTION 'invalid_preference_answers';
  END IF;

  IF NOT p_required_consents @> '{
    "adult_and_school": true,
    "seven_day_schedule": true,
    "activity_budget": true,
    "public_venues_no_alcohol": true,
    "external_contact_prohibited": true,
    "cohort_photo_display": true,
    "attendance_photo": true,
    "final_contact_reveal": true,
    "privacy_policy": true
  }'::jsonb THEN
    RAISE EXCEPTION 'required_consent_missing';
  END IF;

  SELECT a.id INTO v_application_id
  FROM public.campus_seven_applications AS a
  WHERE a.user_id = v_caller
  FOR UPDATE;

  IF v_application_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.campus_seven_applications AS a
    WHERE a.id = v_application_id
      AND a.status NOT IN ('pending', 'identity_review', 'waitlisted', 'withdrawn', 'rejected')
  ) THEN
    RAISE EXCEPTION 'application_locked';
  END IF;

  INSERT INTO public.campus_seven_applications (
    user_id, school, gender, status, preference_answers, consent_version,
    required_consents, card_sale_preference, applied_at, updated_at
  ) VALUES (
    v_caller, v_school, v_gender, 'identity_review', p_preference_answers,
    p_consent_version, p_required_consents, COALESCE(p_card_sale_preference, FALSE), NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET school = EXCLUDED.school,
      gender = EXCLUDED.gender,
      status = 'identity_review',
      preference_answers = EXCLUDED.preference_answers,
      consent_version = EXCLUDED.consent_version,
      required_consents = EXCLUDED.required_consents,
      card_sale_preference = EXCLUDED.card_sale_preference,
      updated_at = NOW()
  RETURNING id INTO v_application_id;

  INSERT INTO public.campus_seven_private_profiles (
    application_id, user_id, submitted_name, verified_name, date_of_birth,
    department_snapshot, identity_verified_at, identity_verification_provider,
    created_at, updated_at
  ) VALUES (
    v_application_id, v_caller, btrim(p_submitted_name), NULL, p_date_of_birth,
    v_department, NULL, NULL, NOW(), NOW()
  )
  ON CONFLICT (application_id) DO UPDATE
  SET submitted_name = EXCLUDED.submitted_name,
      verified_name = NULL,
      date_of_birth = EXCLUDED.date_of_birth,
      department_snapshot = EXCLUDED.department_snapshot,
      identity_verified_at = NULL,
      identity_verification_provider = NULL,
      updated_at = NOW();

  RETURN v_application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT) IS
  'Creates an identity-review application. Card sale remains optional and identity verification is not implied by user input.';

CREATE OR REPLACE FUNCTION public.get_my_campus_seven_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_application JSONB;
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_cohort public.campus_seven_cohorts%ROWTYPE;
  v_kst_date DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_day_number INT := 0;
  v_participants JSONB := '[]'::jsonb;
  v_schedule JSONB;
  v_reservation JSONB;
  v_final_pairs JSONB := '[]'::jsonb;
  v_deposit JSONB;
  v_attendance JSONB;
  v_interest_vote JSONB;
  v_day_two_team JSONB;
  v_day_four_team JSONB;
  v_game_results JSONB := '[]'::jsonb;
  v_my_game_ranks JSONB := '[]'::jsonb;
  v_date_choice_eligible BOOLEAN := FALSE;
  v_incoming_date_choices JSONB := '[]'::jsonb;
  v_outgoing_date_choice JSONB;
  v_incoming_final_proposals JSONB := '[]'::jsonb;
  v_outgoing_final_proposal JSONB;
  v_deposit_reviews JSONB := '[]'::jsonb;
  v_card_publication JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT jsonb_build_object(
    'id', application.id,
    'status', application.status,
    'appliedAt', application.applied_at,
    'cardSalePreference', application.card_sale_preference
  )
  INTO v_application
  FROM public.campus_seven_applications AS application
  WHERE application.user_id = v_caller;

  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller
    AND enrollment.status IN ('active', 'completed')
  ORDER BY enrollment.enrolled_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'application', v_application,
      'enrollment', NULL,
      'cohort', NULL,
      'dayNumber', 0,
      'participants', '[]'::jsonb,
      'schedule', NULL,
      'reservationTask', NULL,
      'attendance', NULL,
      'interestVote', NULL,
      'dayTwoTeam', NULL,
      'dayFourTeam', NULL,
      'gameResults', '[]'::jsonb,
      'myGameRanks', '[]'::jsonb,
      'dateChoiceEligible', FALSE,
      'incomingDateChoices', '[]'::jsonb,
      'outgoingDateChoice', NULL,
      'incomingFinalProposals', '[]'::jsonb,
      'outgoingFinalProposal', NULL,
      'finalPairs', '[]'::jsonb,
      'deposit', NULL,
      'depositReviews', '[]'::jsonb,
      'cardPublication', NULL
    );
  END IF;

  SELECT cohort.* INTO STRICT v_cohort
  FROM public.campus_seven_cohorts AS cohort
  WHERE cohort.id = v_enrollment.cohort_id;

  v_day_number := CASE
    WHEN v_kst_date < v_cohort.start_date THEN 0
    WHEN v_kst_date > v_cohort.start_date + 6 THEN 7
    ELSE (v_kst_date - v_cohort.start_date) + 1
  END;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'userId', participant.user_id,
      'alias', participant.alias,
      'gender', participant.gender,
      'entryRole', participant.entry_role,
      'photoUrl', (
        SELECT NULLIF(btrim(participant_photo.public_url), '')
        FROM public.photos AS participant_photo
        WHERE participant_photo.user_id = participant.user_id
          AND participant_photo.sort_order = 0
        ORDER BY participant_photo.uploaded_at DESC, participant_photo.id
        LIMIT 1
      ),
      'verifiedName', CASE
        WHEN v_day_number >= 5 THEN private_profile.verified_name
        ELSE NULL
      END,
      'exactAge', CASE
        WHEN v_day_number >= 5
          THEN date_part('year', age(v_kst_date, private_profile.date_of_birth))::INT
        ELSE NULL
      END,
      'department', CASE
        WHEN v_cohort.status = 'completed'
          AND participant.user_id <> v_caller
          AND EXISTS (
            SELECT 1
            FROM public.campus_seven_final_choices AS final_pair
            WHERE final_pair.cohort_id = v_cohort.id
              AND final_pair.response = 'accepted'
              AND (
                (final_pair.proposer_user_id = v_caller AND final_pair.target_user_id = participant.user_id)
                OR (final_pair.target_user_id = v_caller AND final_pair.proposer_user_id = participant.user_id)
              )
          )
          THEN private_profile.department_snapshot
        ELSE NULL
      END,
      'phone', CASE
        WHEN v_cohort.status = 'completed'
          AND participant.user_id <> v_caller
          AND EXISTS (
            SELECT 1
            FROM public.campus_seven_final_choices AS final_pair
            WHERE final_pair.cohort_id = v_cohort.id
              AND final_pair.response = 'accepted'
              AND (
                (final_pair.proposer_user_id = v_caller AND final_pair.target_user_id = participant.user_id)
                OR (final_pair.target_user_id = v_caller AND final_pair.proposer_user_id = participant.user_id)
              )
          )
          THEN participant_user.phone
        ELSE NULL
      END
    ) ORDER BY participant.alias
  ), '[]'::jsonb)
  INTO v_participants
  FROM public.campus_seven_enrollments AS participant
  JOIN public.campus_seven_private_profiles AS private_profile
    ON private_profile.application_id = participant.application_id
  JOIN public.users AS participant_user ON participant_user.id = participant.user_id
  WHERE participant.cohort_id = v_cohort.id
    AND participant.status IN ('active', 'completed')
    AND participant.joined_day <= GREATEST(v_day_number, 1);

  IF v_day_number BETWEEN 1 AND 7 THEN
    SELECT jsonb_build_object(
      'id', schedule.id,
      'dayNumber', schedule.day_number,
      'title', schedule.title,
      'summary', schedule.summary,
      'meetingMode', schedule.meeting_mode,
      'budgetWon', schedule.budget_won,
      'startsAt', schedule.starts_at,
      'endsAt', schedule.ends_at,
      'meetingPointName', CASE WHEN schedule.meeting_mode = 'campus_then_venue' THEN v_cohort.meeting_point_name ELSE NULL END,
      'meetingPointAddress', CASE WHEN schedule.meeting_mode = 'campus_then_venue' THEN v_cohort.meeting_point_address ELSE NULL END,
      'venueName', schedule.venue_name,
      'venueAddress', schedule.venue_address,
      'venueBookingUrl', schedule.venue_booking_url,
      'venueStatus', schedule.venue_status,
      'allowedMenuNote', schedule.allowed_menu_note
    )
    INTO v_schedule
    FROM public.campus_seven_daily_schedules AS schedule
    WHERE schedule.cohort_id = v_cohort.id
      AND schedule.day_number = v_day_number;
  END IF;

  SELECT jsonb_build_object(
    'id', task.id,
    'scheduleId', task.schedule_id,
    'status', task.status,
    'remindersSent', task.reminders_sent,
    'deadline', schedule.reservation_deadline,
    'confirmationReference', task.confirmation_reference
  )
  INTO v_reservation
  FROM public.campus_seven_reservation_tasks AS task
  JOIN public.campus_seven_daily_schedules AS schedule ON schedule.id = task.schedule_id
  WHERE task.assignee_enrollment_id = v_enrollment.id
    AND task.status <> 'cancelled'
    AND schedule.ends_at + INTERVAL '2 hours' >= NOW()
  ORDER BY schedule.day_number
  LIMIT 1;

  IF v_day_number BETWEEN 1 AND 7 THEN
    SELECT jsonb_build_object(
      'status', evidence.status,
      'capturedAt', evidence.captured_at,
      'deleteAfter', evidence.delete_after
    )
    INTO v_attendance
    FROM public.campus_seven_attendance_evidence AS evidence
    JOIN public.campus_seven_daily_schedules AS schedule ON schedule.id = evidence.schedule_id
    WHERE schedule.cohort_id = v_cohort.id
      AND schedule.day_number = v_day_number
      AND evidence.enrollment_id = v_enrollment.id;
  END IF;

  IF v_day_number IN (1, 3, 5) THEN
    SELECT jsonb_build_object(
      'dayNumber', vote.day_number,
      'targetUserId', vote.target_user_id,
      'submittedAt', vote.created_at
    )
    INTO v_interest_vote
    FROM public.campus_seven_interest_votes AS vote
    WHERE vote.cohort_id = v_cohort.id
      AND vote.day_number = v_day_number
      AND vote.voter_user_id = v_caller;
  END IF;

  IF v_day_number >= 2 THEN
    SELECT jsonb_build_object(
      'teamCode', own_team.team_code,
      'members', jsonb_agg(jsonb_build_object(
        'userId', member.user_id,
        'alias', member.alias
      ) ORDER BY member.alias)
    )
    INTO v_day_two_team
    FROM public.campus_seven_day_two_teams AS own_team
    JOIN public.campus_seven_day_two_teams AS team_member
      ON team_member.cohort_id = own_team.cohort_id
     AND team_member.team_code = own_team.team_code
    JOIN public.campus_seven_enrollments AS member
      ON member.cohort_id = team_member.cohort_id
     AND member.user_id = team_member.user_id
    WHERE own_team.cohort_id = v_cohort.id
      AND own_team.user_id = v_caller
    GROUP BY own_team.team_code;
  END IF;

  IF v_day_number >= 4 THEN
    SELECT jsonb_build_object(
      'teamCode', own_team.team_code,
      'members', jsonb_agg(jsonb_build_object(
        'userId', member.user_id,
        'alias', member.alias
      ) ORDER BY member.alias)
    )
    INTO v_day_four_team
    FROM public.campus_seven_day_four_teams AS own_team
    JOIN public.campus_seven_day_four_teams AS team_member
      ON team_member.cohort_id = own_team.cohort_id
     AND team_member.team_code = own_team.team_code
    JOIN public.campus_seven_enrollments AS member
      ON member.cohort_id = team_member.cohort_id
     AND member.user_id = team_member.user_id
    WHERE own_team.cohort_id = v_cohort.id
      AND own_team.user_id = v_caller
    GROUP BY own_team.team_code;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'gameName', result.game_name,
      'teamCode', result.team_code,
      'rank', result.rank,
      'points', result.points,
      'lockedAt', result.locked_at
    ) ORDER BY result.game_name, result.rank), '[]'::jsonb)
    INTO v_game_results
    FROM public.campus_seven_game_results AS result
    WHERE result.cohort_id = v_cohort.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'gameName', submission.game_name,
      'rank', submission.rank,
      'updatedAt', submission.updated_at
    ) ORDER BY submission.game_name), '[]'::jsonb)
    INTO v_my_game_ranks
    FROM public.campus_seven_game_rank_submissions AS submission
    JOIN public.campus_seven_day_four_teams AS own_team
      ON own_team.cohort_id = submission.cohort_id
     AND own_team.team_code = submission.team_code
     AND own_team.user_id = v_caller
    WHERE submission.cohort_id = v_cohort.id;
  END IF;

  IF v_day_number = 6 THEN
    WITH vote_totals AS (
      SELECT enrollment.user_id, COUNT(vote.id) AS vote_count
      FROM public.campus_seven_enrollments AS enrollment
      LEFT JOIN public.campus_seven_interest_votes AS vote
        ON vote.cohort_id = enrollment.cohort_id
       AND vote.day_number = 5
       AND vote.target_user_id = enrollment.user_id
      WHERE enrollment.cohort_id = v_cohort.id
        AND enrollment.gender = v_enrollment.gender
        AND enrollment.status = 'active'
      GROUP BY enrollment.user_id
    )
    SELECT caller.vote_count > 0 AND caller.vote_count = MAX(candidate.vote_count)
    INTO v_date_choice_eligible
    FROM vote_totals AS caller
    CROSS JOIN vote_totals AS candidate
    WHERE caller.user_id = v_caller
    GROUP BY caller.vote_count;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', choice.id,
    'chooserUserId', choice.chooser_user_id,
    'chooserAlias', chooser.alias,
    'status', choice.status
  ) ORDER BY choice.created_at), '[]'::jsonb)
  INTO v_incoming_date_choices
  FROM public.campus_seven_date_choices AS choice
  JOIN public.campus_seven_enrollments AS chooser
    ON chooser.cohort_id = choice.cohort_id AND chooser.user_id = choice.chooser_user_id
  WHERE choice.cohort_id = v_cohort.id
    AND choice.target_user_id = v_caller
    AND choice.status = 'pending';

  SELECT jsonb_build_object(
    'id', choice.id,
    'targetUserId', choice.target_user_id,
    'targetAlias', target.alias,
    'status', choice.status
  )
  INTO v_outgoing_date_choice
  FROM public.campus_seven_date_choices AS choice
  JOIN public.campus_seven_enrollments AS target
    ON target.cohort_id = choice.cohort_id AND target.user_id = choice.target_user_id
  WHERE choice.cohort_id = v_cohort.id AND choice.chooser_user_id = v_caller
  ORDER BY choice.selection_round DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'proposerUserId', choice.proposer_user_id,
    'proposerAlias', proposer.alias
  ) ORDER BY choice.created_at), '[]'::jsonb)
  INTO v_incoming_final_proposals
  FROM public.campus_seven_final_choices AS choice
  JOIN public.campus_seven_enrollments AS proposer
    ON proposer.cohort_id = choice.cohort_id AND proposer.user_id = choice.proposer_user_id
  WHERE choice.cohort_id = v_cohort.id
    AND choice.target_user_id = v_caller
    AND choice.response = 'pending';

  SELECT jsonb_build_object(
    'targetUserId', choice.target_user_id,
    'targetAlias', target.alias,
    'response', choice.response
  )
  INTO v_outgoing_final_proposal
  FROM public.campus_seven_final_choices AS choice
  JOIN public.campus_seven_enrollments AS target
    ON target.cohort_id = choice.cohort_id AND target.user_id = choice.target_user_id
  WHERE choice.cohort_id = v_cohort.id AND choice.proposer_user_id = v_caller;

  IF v_cohort.status = 'completed' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'proposerUserId', final_pair.proposer_user_id,
      'proposerAlias', proposer.alias,
      'targetUserId', final_pair.target_user_id,
      'targetAlias', target.alias
    ) ORDER BY proposer.alias), '[]'::jsonb)
    INTO v_final_pairs
    FROM public.campus_seven_final_choices AS final_pair
    JOIN public.campus_seven_enrollments AS proposer
      ON proposer.cohort_id = final_pair.cohort_id
     AND proposer.user_id = final_pair.proposer_user_id
    JOIN public.campus_seven_enrollments AS target
      ON target.cohort_id = final_pair.cohort_id
     AND target.user_id = final_pair.target_user_id
    WHERE final_pair.cohort_id = v_cohort.id
      AND final_pair.response = 'accepted';
  END IF;

  SELECT jsonb_build_object('status', deposit.status, 'amountWon', deposit.amount_won)
  INTO v_deposit
  FROM public.campus_seven_deposit_holds AS deposit
  WHERE deposit.cohort_id = v_cohort.id
    AND deposit.user_id = v_caller;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', review.id,
    'reason', review.reason,
    'amountWon', review.amount_won,
    'status', review.status,
    'appealDeadline', review.appeal_deadline
  ) ORDER BY review.created_at DESC), '[]'::jsonb)
  INTO v_deposit_reviews
  FROM public.campus_seven_deposit_reviews AS review
  WHERE review.cohort_id = v_cohort.id AND review.user_id = v_caller;

  SELECT jsonb_build_object(
    'saleEnabled', publication.sale_enabled,
    'salesOpenAt', publication.sales_open_at,
    'salesCloseAt', publication.sales_close_at,
    'salesCount', (
      SELECT COUNT(*) FROM public.campus_seven_card_purchases AS purchase
      WHERE purchase.cohort_id = publication.cohort_id
        AND purchase.owner_user_id = publication.owner_user_id
        AND purchase.status = 'paid'
    )
  )
  INTO v_card_publication
  FROM public.campus_seven_card_publications AS publication
  WHERE publication.cohort_id = v_cohort.id AND publication.owner_user_id = v_caller;

  RETURN jsonb_build_object(
    'application', v_application,
    'enrollment', jsonb_build_object(
      'id', v_enrollment.id,
      'userId', v_enrollment.user_id,
      'alias', v_enrollment.alias,
      'gender', v_enrollment.gender,
      'entryRole', v_enrollment.entry_role,
      'status', v_enrollment.status
    ),
    'cohort', jsonb_build_object(
      'id', v_cohort.id,
      'school', v_cohort.school,
      'status', v_cohort.status,
      'startDate', v_cohort.start_date,
      'activityBudgetCapWon', v_cohort.activity_budget_cap_won,
      'refundableDepositWon', v_cohort.refundable_deposit_won
    ),
    'dayNumber', v_day_number,
    'participants', v_participants,
    'schedule', v_schedule,
    'reservationTask', v_reservation,
    'attendance', v_attendance,
    'interestVote', v_interest_vote,
    'dayTwoTeam', v_day_two_team,
    'dayFourTeam', v_day_four_team,
    'gameResults', v_game_results,
    'myGameRanks', v_my_game_ranks,
    'dateChoiceEligible', v_date_choice_eligible,
    'incomingDateChoices', v_incoming_date_choices,
    'outgoingDateChoice', v_outgoing_date_choice,
    'incomingFinalProposals', v_incoming_final_proposals,
    'outgoingFinalProposal', v_outgoing_final_proposal,
    'finalPairs', v_final_pairs,
    'deposit', v_deposit,
    'depositReviews', v_deposit_reviews,
    'cardPublication', v_card_publication
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_campus_seven_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_campus_seven_dashboard() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_campus_seven_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_day_two_choices(
  p_target_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_cohort public.campus_seven_cohorts%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
  v_target UUID;
  v_rank INT;
  v_new_man UUID;
  v_new_woman UUID;
  v_man_choices UUID[];
  v_woman_choices UUID[];
  v_unselected_man UUID;
  v_unselected_woman UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF array_length(p_target_user_ids, 1) <> 2
    OR (SELECT COUNT(DISTINCT value) FROM unnest(p_target_user_ids) AS value) <> 2 THEN
    RAISE EXCEPTION 'two_unique_choices_required';
  END IF;

  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller
    AND enrollment.status = 'active'
    AND enrollment.entry_role = 'newcomer';
  IF NOT FOUND THEN RAISE EXCEPTION 'newcomer_only'; END IF;

  SELECT cohort.* INTO STRICT v_cohort
  FROM public.campus_seven_cohorts AS cohort
  WHERE cohort.id = v_enrollment.cohort_id;

  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_cohort.id
    AND schedule.day_number = 2;
  IF NOT FOUND
    OR NOW() < v_schedule.starts_at
    OR NOW() >= v_schedule.starts_at + INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'day_two_choice_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_target_user_ids) AS selected(user_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.campus_seven_enrollments AS target
      WHERE target.cohort_id = v_cohort.id
        AND target.user_id = selected.user_id
        AND target.status = 'active'
        AND target.entry_role = 'starter'
        AND target.gender <> v_enrollment.gender
    )
  ) THEN
    RAISE EXCEPTION 'invalid_day_two_target';
  END IF;

  IF EXISTS (SELECT 1 FROM public.campus_seven_day_two_teams WHERE cohort_id = v_cohort.id) THEN
    RAISE EXCEPTION 'day_two_teams_locked';
  END IF;

  DELETE FROM public.campus_seven_day_two_choices
  WHERE cohort_id = v_cohort.id AND newcomer_user_id = v_caller;

  v_rank := 0;
  FOREACH v_target IN ARRAY p_target_user_ids LOOP
    v_rank := v_rank + 1;
    INSERT INTO public.campus_seven_day_two_choices (
      cohort_id, newcomer_user_id, target_user_id, choice_rank
    ) VALUES (v_cohort.id, v_caller, v_target, v_rank);
  END LOOP;

  SELECT
    (MAX(enrollment.user_id::TEXT) FILTER (WHERE enrollment.gender = 'male'))::UUID,
    (MAX(enrollment.user_id::TEXT) FILTER (WHERE enrollment.gender = 'female'))::UUID
  INTO v_new_man, v_new_woman
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.cohort_id = v_cohort.id
    AND enrollment.entry_role = 'newcomer'
    AND enrollment.status = 'active';

  SELECT array_agg(choice.target_user_id ORDER BY choice.choice_rank)
  INTO v_man_choices
  FROM public.campus_seven_day_two_choices AS choice
  WHERE choice.cohort_id = v_cohort.id AND choice.newcomer_user_id = v_new_man;

  SELECT array_agg(choice.target_user_id ORDER BY choice.choice_rank)
  INTO v_woman_choices
  FROM public.campus_seven_day_two_choices AS choice
  WHERE choice.cohort_id = v_cohort.id AND choice.newcomer_user_id = v_new_woman;

  IF array_length(v_man_choices, 1) = 2 AND array_length(v_woman_choices, 1) = 2 THEN
    SELECT enrollment.user_id INTO STRICT v_unselected_man
    FROM public.campus_seven_enrollments AS enrollment
    WHERE enrollment.cohort_id = v_cohort.id
      AND enrollment.entry_role = 'starter'
      AND enrollment.gender = 'male'
      AND enrollment.status = 'active'
      AND NOT (enrollment.user_id = ANY(v_woman_choices));

    SELECT enrollment.user_id INTO STRICT v_unselected_woman
    FROM public.campus_seven_enrollments AS enrollment
    WHERE enrollment.cohort_id = v_cohort.id
      AND enrollment.entry_role = 'starter'
      AND enrollment.gender = 'female'
      AND enrollment.status = 'active'
      AND NOT (enrollment.user_id = ANY(v_man_choices));

    INSERT INTO public.campus_seven_day_two_teams (cohort_id, team_code, user_id)
    SELECT v_cohort.id, 'A', member_id
    FROM unnest(ARRAY[v_new_man, v_man_choices[1], v_man_choices[2], v_unselected_man]) AS member_id;

    INSERT INTO public.campus_seven_day_two_teams (cohort_id, team_code, user_id)
    SELECT v_cohort.id, 'B', member_id
    FROM unnest(ARRAY[v_new_woman, v_woman_choices[1], v_woman_choices[2], v_unselected_woman]) AS member_id;
  END IF;

  RETURN jsonb_build_object(
    'submitted', TRUE,
    'teamsReady', EXISTS (
      SELECT 1 FROM public.campus_seven_day_two_teams WHERE cohort_id = v_cohort.id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_day_two_choices(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_day_two_choices(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_day_two_choices(UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_game_rank(
  p_game_name TEXT,
  p_rank INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_cohort public.campus_seven_cohorts%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
  v_team_code TEXT;
  v_ready BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_game_name NOT IN ('윷놀이', '할리갈리', '우노', '다빈치 코드', '루미큐브') THEN
    RAISE EXCEPTION 'invalid_game';
  END IF;
  IF NOT (p_rank BETWEEN 1 AND 4) THEN RAISE EXCEPTION 'invalid_rank'; END IF;

  SELECT cohort.*
  INTO v_cohort
  FROM public.campus_seven_enrollments AS enrollment
  JOIN public.campus_seven_cohorts AS cohort ON cohort.id = enrollment.cohort_id
  WHERE enrollment.user_id = v_caller
    AND enrollment.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'day_four_team_required'; END IF;

  SELECT team.team_code INTO v_team_code
  FROM public.campus_seven_day_four_teams AS team
  WHERE team.cohort_id = v_cohort.id AND team.user_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'day_four_team_required'; END IF;
  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_cohort.id
    AND schedule.day_number = 4;
  IF NOT FOUND
    OR NOW() < v_schedule.starts_at + INTERVAL '155 minutes'
    OR NOW() >= v_schedule.ends_at + INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'game_rank_window_closed';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_cohort.id::TEXT || ':' || p_game_name));
  IF EXISTS (
    SELECT 1 FROM public.campus_seven_game_results AS result
    WHERE result.cohort_id = v_cohort.id AND result.game_name = p_game_name
  ) THEN
    RAISE EXCEPTION 'game_rank_locked';
  END IF;

  INSERT INTO public.campus_seven_game_rank_submissions (
    cohort_id, game_name, team_code, submitted_by_user_id, rank
  ) VALUES (
    v_cohort.id, p_game_name, v_team_code, v_caller, p_rank
  )
  ON CONFLICT (cohort_id, game_name, team_code) DO UPDATE
  SET submitted_by_user_id = EXCLUDED.submitted_by_user_id,
      rank = EXCLUDED.rank,
      updated_at = NOW();

  SELECT COUNT(*) = 4 AND COUNT(DISTINCT submission.rank) = 4
  INTO v_ready
  FROM public.campus_seven_game_rank_submissions AS submission
  WHERE submission.cohort_id = v_cohort.id
    AND submission.game_name = p_game_name;

  IF v_ready THEN
    INSERT INTO public.campus_seven_game_results (
      cohort_id, game_name, team_code, rank, points, locked_at
    )
    SELECT
      submission.cohort_id,
      submission.game_name,
      submission.team_code,
      submission.rank,
      5 - submission.rank,
      NOW()
    FROM public.campus_seven_game_rank_submissions AS submission
    WHERE submission.cohort_id = v_cohort.id
      AND submission.game_name = p_game_name;
  END IF;

  RETURN jsonb_build_object(
    'gameName', p_game_name,
    'teamCode', v_team_code,
    'rank', p_rank,
    'locked', v_ready
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_game_rank(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_game_rank(TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_game_rank(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_campus_seven_reservation_task(
  p_schedule_id UUID,
  p_status TEXT,
  p_confirmation_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_task public.campus_seven_reservation_tasks%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_status NOT IN ('confirmed', 'venue_unavailable', 'substitute_requested') THEN
    RAISE EXCEPTION 'invalid_reservation_status';
  END IF;
  IF p_status = 'confirmed' AND char_length(btrim(COALESCE(p_confirmation_reference, ''))) < 2 THEN
    RAISE EXCEPTION 'confirmation_reference_required';
  END IF;

  SELECT task.* INTO v_task
  FROM public.campus_seven_reservation_tasks AS task
  JOIN public.campus_seven_enrollments AS enrollment
    ON enrollment.id = task.assignee_enrollment_id
  WHERE task.schedule_id = p_schedule_id
    AND enrollment.user_id = v_caller
    AND enrollment.status = 'active'
  FOR UPDATE OF task;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_task_not_found'; END IF;
  IF v_task.status <> 'pending' THEN RAISE EXCEPTION 'reservation_task_locked'; END IF;

  UPDATE public.campus_seven_reservation_tasks
  SET status = p_status,
      attempted_at = CASE
        WHEN p_status IN ('confirmed', 'venue_unavailable') THEN NOW()
        ELSE attempted_at
      END,
      confirmation_reference = CASE
        WHEN p_status = 'confirmed' THEN btrim(p_confirmation_reference)
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = v_task.id;

  RETURN jsonb_build_object('scheduleId', p_schedule_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_campus_seven_reservation_task(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_campus_seven_reservation_task(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_campus_seven_reservation_task(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_campus_seven_reservation_reviews()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH candidates AS (
    SELECT task.id AS task_id, schedule.cohort_id, enrollment.user_id
    FROM public.campus_seven_reservation_tasks AS task
    JOIN public.campus_seven_daily_schedules AS schedule ON schedule.id = task.schedule_id
    JOIN public.campus_seven_enrollments AS enrollment ON enrollment.id = task.assignee_enrollment_id
    WHERE task.status = 'pending'
      AND task.reminders_sent >= 2
      AND task.attempted_at IS NULL
      AND task.no_action_detected_at IS NULL
      AND schedule.reservation_deadline < NOW()
      AND enrollment.status = 'active'
    FOR UPDATE OF task SKIP LOCKED
  ), queued AS (
    INSERT INTO public.campus_seven_deposit_reviews (
      cohort_id, user_id, source_reservation_task_id, reason, amount_won, evidence, status
    )
    SELECT
      candidate.cohort_id,
      candidate.user_id,
      candidate.task_id,
      'reservation_no_action',
      10000,
      jsonb_build_object('reservation_task_id', candidate.task_id),
      'pending_review'
    FROM candidates AS candidate
    ON CONFLICT (source_reservation_task_id) DO NOTHING
    RETURNING source_reservation_task_id
  )
  UPDATE public.campus_seven_reservation_tasks AS task
  SET no_action_detected_at = NOW(), updated_at = NOW()
  WHERE task.id IN (SELECT queued.source_reservation_task_id FROM queued);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_campus_seven_reservation_reviews() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_campus_seven_reservation_reviews() FROM anon;
REVOKE ALL ON FUNCTION public.queue_campus_seven_reservation_reviews() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_campus_seven_reservation_reviews() TO service_role;

CREATE OR REPLACE FUNCTION public.queue_campus_seven_no_show_reviews()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH candidates AS (
    SELECT schedule.cohort_id, enrollment.user_id, schedule.id AS schedule_id
    FROM public.campus_seven_daily_schedules AS schedule
    JOIN public.campus_seven_enrollments AS enrollment
      ON enrollment.cohort_id = schedule.cohort_id
     AND enrollment.joined_day <= schedule.day_number
     AND enrollment.status IN ('active', 'completed')
    WHERE schedule.ends_at + INTERVAL '2 hours' < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM public.campus_seven_attendance_evidence AS evidence
        WHERE evidence.schedule_id = schedule.id
          AND evidence.enrollment_id = enrollment.id
          AND evidence.status IN ('submitted', 'verified')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.campus_seven_safety_reports AS report
        WHERE report.cohort_id = schedule.cohort_id
          AND report.reporter_user_id = enrollment.user_id
          AND report.safety_exit_requested = TRUE
          AND report.created_at <= schedule.ends_at + INTERVAL '2 hours'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.campus_seven_deposit_reviews AS review
        WHERE review.cohort_id = schedule.cohort_id
          AND review.user_id = enrollment.user_id
          AND review.reason = 'unexcused_no_show'
      )
    ORDER BY schedule.day_number
    FOR UPDATE OF enrollment SKIP LOCKED
  )
  INSERT INTO public.campus_seven_deposit_reviews (
    cohort_id, user_id, reason, amount_won, evidence, status
  )
  SELECT
    candidate.cohort_id,
    candidate.user_id,
    'unexcused_no_show',
    50000,
    jsonb_build_object('missing_schedule_id', candidate.schedule_id),
    'pending_review'
  FROM candidates AS candidate
  ON CONFLICT (cohort_id, user_id) WHERE reason = 'unexcused_no_show' DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_campus_seven_no_show_reviews() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_campus_seven_no_show_reviews() FROM anon;
REVOKE ALL ON FUNCTION public.queue_campus_seven_no_show_reviews() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_campus_seven_no_show_reviews() TO service_role;

CREATE OR REPLACE FUNCTION public.appeal_campus_seven_deposit_review(
  p_review_id UUID,
  p_appeal_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_review public.campus_seven_deposit_reviews%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF char_length(btrim(COALESCE(p_appeal_text, ''))) NOT BETWEEN 2 AND 1000 THEN
    RAISE EXCEPTION 'invalid_appeal_text';
  END IF;

  SELECT review.* INTO v_review
  FROM public.campus_seven_deposit_reviews AS review
  WHERE review.id = p_review_id AND review.user_id = v_caller
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_review_not_found'; END IF;
  IF v_review.status <> 'pending_review' THEN RAISE EXCEPTION 'deposit_review_not_appealable'; END IF;
  IF v_review.appeal_deadline < NOW() THEN RAISE EXCEPTION 'deposit_review_appeal_expired'; END IF;

  UPDATE public.campus_seven_deposit_reviews
  SET status = 'appealed', appeal_text = btrim(p_appeal_text)
  WHERE id = v_review.id;

  RETURN jsonb_build_object('reviewId', v_review.id, 'status', 'appealed');
END;
$$;

REVOKE ALL ON FUNCTION public.appeal_campus_seven_deposit_review(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.appeal_campus_seven_deposit_review(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.appeal_campus_seven_deposit_review(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_attendance(
  p_schedule_id UUID,
  p_object_path TEXT,
  p_captured_at TIMESTAMPTZ,
  p_watermark_text TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
  v_expected_watermark TEXT;
  v_delete_after TIMESTAMPTZ;
  v_evidence_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.id = p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_found'; END IF;

  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.cohort_id = v_schedule.cohort_id
    AND enrollment.user_id = v_caller
    AND enrollment.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active_enrollment_required'; END IF;

  IF p_captured_at < v_schedule.starts_at - INTERVAL '30 minutes'
    OR p_captured_at > v_schedule.ends_at + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'attendance_capture_outside_window';
  END IF;
  IF p_object_path NOT LIKE v_caller::TEXT || '/%' THEN
    RAISE EXCEPTION 'invalid_attendance_path';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'campus-seven-attendance'
      AND object.name = p_object_path
      AND object.owner_id::TEXT = v_caller::TEXT
  ) THEN
    RAISE EXCEPTION 'attendance_object_missing';
  END IF;

  v_expected_watermark := format(
    'Quantum Day %s | %s',
    v_schedule.day_number,
    to_char(v_schedule.starts_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
  );
  IF p_watermark_text <> v_expected_watermark THEN
    RAISE EXCEPTION 'attendance_watermark_invalid';
  END IF;

  SELECT COALESCE(deposit.settled_at + INTERVAL '30 days', v_schedule.ends_at + INTERVAL '60 days')
  INTO v_delete_after
  FROM public.campus_seven_deposit_holds AS deposit
  WHERE deposit.cohort_id = v_schedule.cohort_id
    AND deposit.user_id = v_caller;
  v_delete_after := COALESCE(v_delete_after, v_schedule.ends_at + INTERVAL '60 days');

  INSERT INTO public.campus_seven_attendance_evidence (
    schedule_id, enrollment_id, object_path, watermark_text, captured_at, delete_after
  ) VALUES (
    p_schedule_id, v_enrollment.id, p_object_path, p_watermark_text, p_captured_at, v_delete_after
  )
  RETURNING id INTO v_evidence_id;

  RETURN v_evidence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_attendance(UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_attendance(UUID, TEXT, TIMESTAMPTZ, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_attendance(UUID, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_interest_vote(
  p_day_number INT,
  p_target_user_id UUID,
  p_positive_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_cohort public.campus_seven_cohorts%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
  v_target_gender TEXT;
  v_vote_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_day_number NOT IN (1, 3, 5) THEN RAISE EXCEPTION 'invalid_interest_day'; END IF;
  IF char_length(btrim(COALESCE(p_positive_reason, ''))) NOT BETWEEN 2 AND 60
    OR private.campus_seven_has_prohibited_contact(p_positive_reason) THEN
    RAISE EXCEPTION 'invalid_interest_reason';
  END IF;

  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller AND enrollment.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active_enrollment_required'; END IF;

  SELECT cohort.* INTO STRICT v_cohort
  FROM public.campus_seven_cohorts AS cohort
  WHERE cohort.id = v_enrollment.cohort_id;
  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_cohort.id
    AND schedule.day_number = p_day_number;
  IF NOT FOUND
    OR NOW() < v_schedule.starts_at + INTERVAL '155 minutes'
    OR NOW() >= v_schedule.ends_at + INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'interest_vote_closed';
  END IF;

  SELECT target.gender INTO v_target_gender
  FROM public.campus_seven_enrollments AS target
  WHERE target.cohort_id = v_cohort.id
    AND target.user_id = p_target_user_id
    AND target.status = 'active'
    AND target.joined_day <= p_day_number;
  IF v_target_gender IS NULL OR v_target_gender = v_enrollment.gender THEN
    RAISE EXCEPTION 'invalid_interest_target';
  END IF;

  INSERT INTO public.campus_seven_interest_votes (
    cohort_id, day_number, voter_user_id, target_user_id, positive_reason
  ) VALUES (
    v_cohort.id, p_day_number, v_caller, p_target_user_id, btrim(p_positive_reason)
  )
  RETURNING id INTO v_vote_id;

  RETURN v_vote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_interest_vote(INT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_interest_vote(INT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_interest_vote(INT, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_date_choice(
  p_target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_cohort public.campus_seven_cohorts%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
  v_target_gender TEXT;
  v_vote_count INT;
  v_max_count INT;
  v_round INT;
  v_choice_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller AND enrollment.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active_enrollment_required'; END IF;
  SELECT cohort.* INTO STRICT v_cohort
  FROM public.campus_seven_cohorts AS cohort
  WHERE cohort.id = v_enrollment.cohort_id;
  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_cohort.id
    AND schedule.day_number = 6;
  IF NOT FOUND
    OR NOW() < v_schedule.starts_at - INTERVAL '7 hours'
    OR NOW() >= v_schedule.starts_at - INTERVAL '4 hours' THEN
    RAISE EXCEPTION 'day_six_choice_closed';
  END IF;

  SELECT COUNT(*) INTO v_vote_count
  FROM public.campus_seven_interest_votes AS vote
  WHERE vote.cohort_id = v_cohort.id
    AND vote.day_number = 5
    AND vote.target_user_id = v_caller;

  SELECT COALESCE(MAX(candidate.vote_count), 0) INTO v_max_count
  FROM (
    SELECT enrollment.user_id, COUNT(vote.id) AS vote_count
    FROM public.campus_seven_enrollments AS enrollment
    LEFT JOIN public.campus_seven_interest_votes AS vote
      ON vote.cohort_id = enrollment.cohort_id
     AND vote.day_number = 5
     AND vote.target_user_id = enrollment.user_id
    WHERE enrollment.cohort_id = v_cohort.id
      AND enrollment.gender = v_enrollment.gender
      AND enrollment.status = 'active'
    GROUP BY enrollment.user_id
  ) AS candidate;

  IF v_vote_count = 0 OR v_vote_count <> v_max_count THEN
    RAISE EXCEPTION 'date_choice_right_required';
  END IF;

  SELECT target.gender INTO v_target_gender
  FROM public.campus_seven_enrollments AS target
  WHERE target.cohort_id = v_cohort.id
    AND target.user_id = p_target_user_id
    AND target.status = 'active';
  IF v_target_gender IS NULL OR v_target_gender = v_enrollment.gender THEN
    RAISE EXCEPTION 'invalid_date_target';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.campus_seven_date_choices AS accepted
    WHERE accepted.cohort_id = v_cohort.id
      AND accepted.status = 'accepted'
      AND (
        accepted.chooser_user_id IN (v_caller, p_target_user_id)
        OR accepted.target_user_id IN (v_caller, p_target_user_id)
      )
  ) THEN
    RAISE EXCEPTION 'participant_already_has_special_date';
  END IF;

  SELECT COALESCE(MAX(choice.selection_round), 0) + 1 INTO v_round
  FROM public.campus_seven_date_choices AS choice
  WHERE choice.cohort_id = v_cohort.id AND choice.chooser_user_id = v_caller;

  INSERT INTO public.campus_seven_date_choices (
    cohort_id, chooser_user_id, target_user_id, selection_round
  ) VALUES (v_cohort.id, v_caller, p_target_user_id, v_round)
  RETURNING id INTO v_choice_id;

  RETURN v_choice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_date_choice(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_date_choice(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_date_choice(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_campus_seven_date_choice(
  p_choice_id UUID,
  p_accept BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_choice public.campus_seven_date_choices%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT choice.* INTO v_choice
  FROM public.campus_seven_date_choices AS choice
  WHERE choice.id = p_choice_id AND choice.target_user_id = v_caller
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'date_choice_not_found'; END IF;
  IF v_choice.status <> 'pending' THEN RAISE EXCEPTION 'date_choice_already_answered'; END IF;

  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_choice.cohort_id
    AND schedule.day_number = 6;
  IF NOT FOUND
    OR NOW() < v_schedule.starts_at - INTERVAL '7 hours'
    OR NOW() >= v_schedule.starts_at - INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'date_response_window_closed';
  END IF;

  IF COALESCE(p_accept, FALSE) THEN
    IF EXISTS (
      SELECT 1 FROM public.campus_seven_date_choices AS accepted
      WHERE accepted.cohort_id = v_choice.cohort_id
        AND accepted.status = 'accepted'
        AND (
          accepted.chooser_user_id IN (v_choice.chooser_user_id, v_caller)
          OR accepted.target_user_id IN (v_choice.chooser_user_id, v_caller)
        )
    ) THEN
      RAISE EXCEPTION 'participant_already_has_special_date';
    END IF;

    UPDATE public.campus_seven_date_choices
    SET status = 'declined', responded_at = NOW()
    WHERE cohort_id = v_choice.cohort_id
      AND target_user_id = v_caller
      AND id <> v_choice.id
      AND status = 'pending';

    UPDATE public.campus_seven_date_choices
    SET status = 'accepted', responded_at = NOW()
    WHERE id = v_choice.id;
    RETURN 'accepted';
  END IF;

  UPDATE public.campus_seven_date_choices
  SET status = 'declined', responded_at = NOW()
  WHERE id = v_choice.id;
  RETURN 'declined';
END;
$$;

REVOKE ALL ON FUNCTION public.respond_campus_seven_date_choice(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_campus_seven_date_choice(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_campus_seven_date_choice(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_final_proposal(
  p_target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
  v_target_gender TEXT;
  v_choice_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller AND enrollment.status = 'active';
  IF NOT FOUND OR v_enrollment.gender <> 'male' THEN RAISE EXCEPTION 'final_proposer_not_eligible'; END IF;

  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_enrollment.cohort_id AND schedule.day_number = 7;
  IF NOT FOUND
    OR NOW() < v_schedule.ends_at
    OR NOW() >= v_schedule.ends_at + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'final_proposal_window_closed';
  END IF;

  SELECT target.gender INTO v_target_gender
  FROM public.campus_seven_enrollments AS target
  WHERE target.cohort_id = v_enrollment.cohort_id
    AND target.user_id = p_target_user_id
    AND target.status = 'active';
  IF v_target_gender IS DISTINCT FROM 'female' THEN RAISE EXCEPTION 'invalid_final_target'; END IF;

  INSERT INTO public.campus_seven_final_choices (cohort_id, proposer_user_id, target_user_id)
  VALUES (v_enrollment.cohort_id, v_caller, p_target_user_id)
  RETURNING id INTO v_choice_id;
  RETURN v_choice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_final_proposal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_final_proposal(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_final_proposal(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_campus_seven_final_proposal(
  p_proposer_user_id UUID,
  p_accept BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_choice public.campus_seven_final_choices%ROWTYPE;
  v_schedule public.campus_seven_daily_schedules%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT choice.* INTO v_choice
  FROM public.campus_seven_final_choices AS choice
  WHERE choice.proposer_user_id = p_proposer_user_id
    AND choice.target_user_id = v_caller
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'final_proposal_not_found'; END IF;
  IF v_choice.response <> 'pending' THEN RAISE EXCEPTION 'final_proposal_already_answered'; END IF;

  SELECT schedule.* INTO v_schedule
  FROM public.campus_seven_daily_schedules AS schedule
  WHERE schedule.cohort_id = v_choice.cohort_id
    AND schedule.day_number = 7;
  IF NOT FOUND
    OR NOW() < v_schedule.ends_at
    OR NOW() >= v_schedule.ends_at + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'final_response_window_closed';
  END IF;

  IF COALESCE(p_accept, FALSE) THEN
    UPDATE public.campus_seven_final_choices
    SET response = 'rejected', responded_at = NOW()
    WHERE cohort_id = v_choice.cohort_id
      AND target_user_id = v_caller
      AND proposer_user_id <> p_proposer_user_id
      AND response = 'pending';

    UPDATE public.campus_seven_final_choices
    SET response = 'accepted', responded_at = NOW()
    WHERE id = v_choice.id;
    RETURN 'accepted';
  END IF;

  UPDATE public.campus_seven_final_choices
  SET response = 'rejected', responded_at = NOW()
  WHERE id = v_choice.id;
  RETURN 'rejected';
END;
$$;

REVOKE ALL ON FUNCTION public.respond_campus_seven_final_proposal(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_campus_seven_final_proposal(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_campus_seven_final_proposal(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_seven_safety_report(
  p_target_user_id UUID,
  p_category TEXT,
  p_detail TEXT,
  p_safety_exit_requested BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_report_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_category NOT IN ('harassment', 'stalking', 'contact_request', 'threat', 'intoxication', 'emergency', 'other') THEN
    RAISE EXCEPTION 'invalid_safety_category';
  END IF;
  IF char_length(btrim(COALESCE(p_detail, ''))) NOT BETWEEN 2 AND 1000 THEN
    RAISE EXCEPTION 'invalid_safety_detail';
  END IF;

  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller
    AND enrollment.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active_enrollment_required'; END IF;

  IF p_target_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.campus_seven_enrollments AS target
    WHERE target.cohort_id = v_enrollment.cohort_id
      AND target.user_id = p_target_user_id
      AND target.user_id <> v_caller
  ) THEN
    RAISE EXCEPTION 'invalid_report_target';
  END IF;

  INSERT INTO public.campus_seven_safety_reports (
    cohort_id, reporter_user_id, target_user_id, category, detail, safety_exit_requested
  ) VALUES (
    v_enrollment.cohort_id, v_caller, p_target_user_id, p_category,
    btrim(p_detail), COALESCE(p_safety_exit_requested, FALSE)
  )
  RETURNING id INTO v_report_id;

  IF COALESCE(p_safety_exit_requested, FALSE) THEN
    UPDATE public.campus_seven_enrollments
    SET status = 'safety_withdrawn', withdrawn_at = NOW()
    WHERE id = v_enrollment.id;

    UPDATE public.campus_seven_reservation_tasks AS task
    SET status = 'cancelled', updated_at = NOW()
    FROM public.campus_seven_daily_schedules AS schedule
    WHERE task.schedule_id = schedule.id
      AND task.assignee_enrollment_id = v_enrollment.id
      AND task.status = 'pending'
      AND schedule.ends_at > NOW();

    UPDATE public.campus_seven_date_choices
    SET status = 'safety_withdrawn', responded_at = NOW()
    WHERE cohort_id = v_enrollment.cohort_id
      AND status = 'pending'
      AND (chooser_user_id = v_caller OR target_user_id = v_caller);

    UPDATE public.campus_seven_final_choices
    SET response = 'rejected', responded_at = NOW()
    WHERE cohort_id = v_enrollment.cohort_id
      AND response = 'pending'
      AND (proposer_user_id = v_caller OR target_user_id = v_caller);
  END IF;

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campus_seven_safety_report(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_campus_seven_safety_report(UUID, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_seven_safety_report(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.submit_campus_seven_safety_report(UUID, TEXT, TEXT, BOOLEAN) IS
  'Stores a private report and optionally stops future assignments. Safety exit never creates a deposit review.';

CREATE OR REPLACE FUNCTION public.set_campus_seven_card_publication(
  p_sale_enabled BOOLEAN,
  p_consent_version TEXT DEFAULT 'campus-seven-card-sale-v1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_enrollment public.campus_seven_enrollments%ROWTYPE;
  v_cohort public.campus_seven_cohorts%ROWTYPE;
  v_open_at TIMESTAMPTZ;
  v_close_at TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF COALESCE(p_sale_enabled, FALSE) AND NOT COALESCE((
    SELECT settings.card_payments_enabled
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) THEN
    RAISE EXCEPTION 'card_payments_not_approved';
  END IF;
  SELECT enrollment.* INTO v_enrollment
  FROM public.campus_seven_enrollments AS enrollment
  WHERE enrollment.user_id = v_caller
    AND enrollment.status = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'completed_enrollment_required'; END IF;

  SELECT cohort.* INTO STRICT v_cohort
  FROM public.campus_seven_cohorts AS cohort
  WHERE cohort.id = v_enrollment.cohort_id;
  IF v_cohort.status <> 'completed' OR v_cohort.completed_at IS NULL THEN
    RAISE EXCEPTION 'cohort_not_completed';
  END IF;

  v_open_at := v_cohort.completed_at;
  v_close_at := v_cohort.completed_at + INTERVAL '7 days';

  INSERT INTO public.campus_seven_card_publications (
    cohort_id, owner_user_id, previewed_at, sale_enabled, sale_consent_version,
    sale_consented_at, sales_open_at, sales_close_at, delete_after, stopped_at
  ) VALUES (
    v_cohort.id,
    v_caller,
    NOW(),
    COALESCE(p_sale_enabled, FALSE),
    CASE WHEN COALESCE(p_sale_enabled, FALSE) THEN p_consent_version ELSE NULL END,
    CASE WHEN COALESCE(p_sale_enabled, FALSE) THEN NOW() ELSE NULL END,
    v_open_at,
    v_close_at,
    v_close_at + INTERVAL '24 hours',
    CASE WHEN COALESCE(p_sale_enabled, FALSE) THEN NULL ELSE NOW() END
  )
  ON CONFLICT (cohort_id, owner_user_id) DO UPDATE
  SET previewed_at = COALESCE(public.campus_seven_card_publications.previewed_at, NOW()),
      sale_enabled = COALESCE(p_sale_enabled, FALSE),
      sale_consent_version = CASE
        WHEN COALESCE(p_sale_enabled, FALSE) THEN p_consent_version
        ELSE public.campus_seven_card_publications.sale_consent_version
      END,
      sale_consented_at = CASE
        WHEN COALESCE(p_sale_enabled, FALSE) THEN NOW()
        ELSE public.campus_seven_card_publications.sale_consented_at
      END,
      sales_open_at = v_open_at,
      sales_close_at = v_close_at,
      delete_after = GREATEST(
        v_close_at + INTERVAL '24 hours',
        COALESCE((
          SELECT MAX(purchase.access_expires_at)
          FROM public.campus_seven_card_purchases AS purchase
          WHERE purchase.cohort_id = v_cohort.id
            AND purchase.owner_user_id = v_caller
            AND purchase.status = 'paid'
        ), v_close_at + INTERVAL '24 hours')
      ),
      stopped_at = CASE WHEN COALESCE(p_sale_enabled, FALSE) THEN NULL ELSE NOW() END,
      updated_at = NOW();

  RETURN jsonb_build_object(
    'saleEnabled', COALESCE(p_sale_enabled, FALSE),
    'salesCloseAt', v_close_at,
    'priceWon', 1000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_seven_card_publication(BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_campus_seven_card_publication(BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_campus_seven_card_publication(BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campus_seven_card(
  p_owner_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_cohort_id UUID;
  v_answers JSONB;
  v_votes JSONB;
  v_sales_count INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT owner.cohort_id INTO v_cohort_id
  FROM public.campus_seven_enrollments AS owner
  JOIN public.campus_seven_enrollments AS buyer
    ON buyer.cohort_id = owner.cohort_id
   AND buyer.user_id = v_caller
  WHERE owner.user_id = p_owner_user_id
    AND owner.status = 'completed'
    AND buyer.status = 'completed';
  IF v_cohort_id IS NULL THEN RAISE EXCEPTION 'same_cohort_required'; END IF;

  IF v_caller <> p_owner_user_id AND NOT EXISTS (
    SELECT 1
    FROM public.campus_seven_card_purchases AS purchase
    WHERE purchase.cohort_id = v_cohort_id
      AND purchase.owner_user_id = p_owner_user_id
      AND purchase.buyer_user_id = v_caller
      AND purchase.status = 'paid'
      AND purchase.access_expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'active_card_purchase_required';
  END IF;

  SELECT application.preference_answers INTO v_answers
  FROM public.campus_seven_applications AS application
  WHERE application.user_id = p_owner_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dayNumber', vote.day_number,
    'selectedAlias', target.alias,
    'positiveReason', vote.positive_reason
  ) ORDER BY vote.day_number), '[]'::jsonb)
  INTO v_votes
  FROM public.campus_seven_interest_votes AS vote
  JOIN public.campus_seven_enrollments AS target
    ON target.cohort_id = vote.cohort_id
   AND target.user_id = vote.target_user_id
  WHERE vote.cohort_id = v_cohort_id
    AND vote.voter_user_id = p_owner_user_id
    AND vote.day_number IN (1, 3, 5);

  SELECT COUNT(*) INTO v_sales_count
  FROM public.campus_seven_card_purchases AS purchase
  WHERE purchase.cohort_id = v_cohort_id
    AND purchase.owner_user_id = p_owner_user_id
    AND purchase.status = 'paid';

  RETURN jsonb_build_object(
    'ownerUserId', p_owner_user_id,
    'preferenceAnswers', COALESCE(v_answers, '{}'::jsonb),
    'interestHistory', v_votes,
    'salesCount', CASE WHEN v_caller = p_owner_user_id THEN v_sales_count ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_campus_seven_card(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_seven_card(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campus_seven_card(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_campus_seven_cohorts()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH completed AS (
    UPDATE public.campus_seven_cohorts AS cohort
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE cohort.status = 'running'
      AND EXISTS (
        SELECT 1 FROM public.campus_seven_daily_schedules AS schedule
        WHERE schedule.cohort_id = cohort.id
          AND schedule.day_number = 7
          AND schedule.ends_at <= NOW()
      )
    RETURNING cohort.id, cohort.completed_at
  ), completed_enrollments AS (
    UPDATE public.campus_seven_enrollments AS enrollment
    SET status = 'completed'
    WHERE enrollment.status = 'active'
      AND enrollment.cohort_id IN (SELECT completed.id FROM completed)
    RETURNING enrollment.cohort_id, enrollment.user_id
  )
  INSERT INTO public.campus_seven_card_publications (
    cohort_id, owner_user_id, sale_enabled, sales_open_at, sales_close_at, delete_after
  )
  SELECT
    completed.id,
    enrollment.user_id,
    FALSE,
    completed.completed_at,
    completed.completed_at + INTERVAL '7 days',
    completed.completed_at + INTERVAL '8 days'
  FROM completed
  JOIN completed_enrollments AS enrollment ON enrollment.cohort_id = completed.id
  ON CONFLICT (cohort_id, owner_user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_campus_seven_cohorts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_campus_seven_cohorts() FROM anon;
REVOKE ALL ON FUNCTION public.finalize_campus_seven_cohorts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_campus_seven_cohorts() TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_campus_seven_private_data()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  DELETE FROM storage.objects AS object
  USING public.campus_seven_attendance_evidence AS evidence
  WHERE object.bucket_id = 'campus-seven-attendance'
    AND object.name = evidence.object_path
    AND evidence.deleted_at IS NULL
    AND evidence.delete_after <= NOW();

  UPDATE public.campus_seven_attendance_evidence
  SET status = 'deleted', deleted_at = NOW()
  WHERE deleted_at IS NULL AND delete_after <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.campus_seven_interest_votes AS vote
  USING public.campus_seven_card_publications AS publication
  WHERE vote.cohort_id = publication.cohort_id
    AND vote.voter_user_id = publication.owner_user_id
    AND publication.delete_after <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.campus_seven_card_purchases AS purchase
      WHERE purchase.cohort_id = publication.cohort_id
        AND purchase.owner_user_id = publication.owner_user_id
        AND purchase.status = 'paid'
        AND purchase.access_expires_at > NOW()
    );

  UPDATE public.campus_seven_applications AS application
  SET preference_answers = '{}'::jsonb, updated_at = NOW()
  FROM public.campus_seven_card_publications AS publication
  WHERE application.user_id = publication.owner_user_id
    AND publication.delete_after <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.campus_seven_card_purchases AS purchase
      WHERE purchase.cohort_id = publication.cohort_id
        AND purchase.owner_user_id = publication.owner_user_id
        AND purchase.status = 'paid'
        AND purchase.access_expires_at > NOW()
    );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_campus_seven_private_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_campus_seven_private_data() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_campus_seven_private_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_campus_seven_private_data() TO service_role;

COMMIT;
