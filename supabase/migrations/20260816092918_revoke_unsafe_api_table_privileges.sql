-- Browser-facing roles never need schema-management privileges on application
-- tables. Row-level security does not apply to TRUNCATE, so keep these powers
-- exclusively with trusted database roles.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM anon, authenticated;
