-- Protect generic manufacturing records that existed before the historical
-- typed-copy promotion in 043. The guard lives only across that migration.
LOCK TABLE local_manufacturing_records IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE local_043_existing_manufacturing_ids (
  id text PRIMARY KEY
);

INSERT INTO local_043_existing_manufacturing_ids(id)
SELECT id
FROM local_manufacturing_records;

CREATE FUNCTION local_043_guard_typed_promotion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM local_043_existing_manufacturing_ids captured
    WHERE captured.id = NEW.id
       OR (NEW.parent_id IS NOT NULL AND captured.id = NEW.parent_id)
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER local_043_guard_typed_promotion
BEFORE INSERT ON local_manufacturing_records
FOR EACH ROW
EXECUTE FUNCTION local_043_guard_typed_promotion();
