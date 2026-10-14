-- The promotion guard is intentionally temporary. Keep every business row;
-- remove only the objects used to protect the 043 backfill boundary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM local_schema_migrations
    WHERE name='043_local_cutting_remake_supplements.sql'
  ) THEN
    RAISE EXCEPTION 'Refusing to remove the 043 promotion guard before the protected migration is recorded';
  END IF;
  IF to_regclass('public.local_043_existing_manufacturing_ids') IS NULL THEN
    RAISE EXCEPTION 'The 043 promotion capture table is missing';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS local_043_guard_typed_promotion ON local_manufacturing_records;
DROP FUNCTION IF EXISTS local_043_guard_typed_promotion();
DROP TABLE IF EXISTS local_043_existing_manufacturing_ids;
