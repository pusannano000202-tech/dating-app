-- The private appearance-score worker must read the current user's stored
-- photo metadata and gender before it can claim a private analysis lease.
-- Browser roles keep their existing grants and RLS policies unchanged.
GRANT SELECT ON TABLE public.photos, public.profiles TO service_role;

COMMENT ON TABLE public.photos IS
  'Profile photo metadata. Server-side appearance analysis may read rows through service_role; client access remains RLS-controlled.';
