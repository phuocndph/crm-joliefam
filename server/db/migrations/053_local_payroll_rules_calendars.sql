-- Explicit, bounded payroll configuration. No default monetary policy is seeded.
CREATE TABLE local_payroll_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_group_id uuid NOT NULL REFERENCES local_payroll_policy_groups(id),
  location_code text,
  rule_kind text NOT NULL CHECK(rule_kind IN ('OT','MEAL')),
  overtime_type text CHECK(overtime_type IN ('NORMAL','SUNDAY','HOLIDAY')),
  calculation_method text CHECK(calculation_method IN ('BASE_RATE_MULTIPLIER','FIXED_RATE')),
  multiplier numeric(12,6) CHECK(multiplier <> 'NaN'::numeric), fixed_rate numeric(20,6) CHECK(fixed_rate <> 'NaN'::numeric), meal_rate numeric(20,6) CHECK(meal_rate <> 'NaN'::numeric),
  effective_from date NOT NULL, effective_to date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED')),
  reason text NOT NULL CHECK(length(btrim(reason))>0), source_reference text NOT NULL CHECK(length(btrim(source_reference))>0),
  created_by text NOT NULL, approved_by text, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
  CHECK(effective_to>=effective_from), CHECK(location_code IS NULL OR length(btrim(location_code))>0),
  CHECK((rule_kind='MEAL' AND meal_rate IS NOT NULL AND meal_rate>=0 AND overtime_type IS NULL AND calculation_method IS NULL AND multiplier IS NULL AND fixed_rate IS NULL)
    OR (rule_kind='OT' AND overtime_type IS NOT NULL AND calculation_method IS NOT NULL AND meal_rate IS NULL AND ((calculation_method='BASE_RATE_MULTIPLIER' AND multiplier IS NOT NULL AND multiplier>0 AND fixed_rate IS NULL) OR (calculation_method='FIXED_RATE' AND fixed_rate IS NOT NULL AND fixed_rate>0 AND multiplier IS NULL)))),
  CHECK(status<>'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE local_payroll_calendar_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL, period_end date NOT NULL, location_code text NOT NULL,
  standard_days numeric(8,2) NOT NULL CHECK(standard_days>0 AND standard_days<>'NaN'::numeric), daily_minutes numeric(8,2) NOT NULL CHECK(daily_minutes>0 AND daily_minutes<=1440),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED')),
  reason text NOT NULL CHECK(length(btrim(reason))>0), source_reference text NOT NULL CHECK(length(btrim(source_reference))>0),
  created_by text NOT NULL, approved_by text, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
  CHECK(period_end>=period_start), CHECK(length(btrim(location_code))>0),
  CHECK(status<>'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
-- __UNASSIGNED__ is an explicit location for workers whose master has no location.
CREATE FUNCTION local_payroll_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' AND OLD.status='APPROVED' THEN RAISE EXCEPTION 'Phiên bản đã duyệt là bất biến; hãy tạo phiên bản mới.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.status='APPROVED' THEN
    -- Approval serializes against every competing configuration write; acquire
    -- this statement-level lock before row locks (see triggers below).
    IF TG_TABLE_NAME='local_payroll_rule_versions' THEN
      IF EXISTS(SELECT 1 FROM local_payroll_rule_versions r WHERE r.id<>NEW.id AND r.status='APPROVED'
        AND r.policy_group_id=NEW.policy_group_id AND r.rule_kind=NEW.rule_kind AND r.overtime_type IS NOT DISTINCT FROM NEW.overtime_type
        AND (r.location_code IS NULL OR NEW.location_code IS NULL OR r.location_code=NEW.location_code)
        AND r.effective_from<=NEW.effective_to AND r.effective_to>=NEW.effective_from)
      THEN RAISE EXCEPTION 'Chính sách giao ngày/phạm vi đã duyệt; không có thứ tự ưu tiên ngầm.'; END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM local_payroll_calendar_versions c WHERE c.id<>NEW.id AND c.status='APPROVED' AND c.location_code=NEW.location_code
        AND c.period_start<=NEW.period_end AND c.period_end>=NEW.period_start)
      THEN RAISE EXCEPTION 'Lịch công cơ sở giao với kỳ đã duyệt.'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION local_payroll_config_write_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('local-payroll-version-config',0));
  RETURN NULL;
END $$;
CREATE TRIGGER payroll_rules_source_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_rule_versions FOR EACH STATEMENT EXECUTE FUNCTION local_payroll_config_write_lock();
CREATE TRIGGER payroll_calendar_source_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_calendar_versions FOR EACH STATEMENT EXECUTE FUNCTION local_payroll_config_write_lock();
CREATE TRIGGER payroll_rules_version_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_rule_versions FOR EACH ROW EXECUTE FUNCTION local_payroll_version_guard();
CREATE TRIGGER payroll_calendar_version_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_calendar_versions FOR EACH ROW EXECUTE FUNCTION local_payroll_version_guard();
ALTER TABLE local_payroll_records ADD COLUMN employee_identity_snapshot jsonb;
ALTER TABLE local_payroll_periods ALTER COLUMN standard_days DROP NOT NULL, ALTER COLUMN standard_days DROP DEFAULT;
ALTER TABLE local_payroll_runs ALTER COLUMN standard_days_snapshot DROP NOT NULL;

CREATE FUNCTION local_payroll_worker_eligible(p_worker uuid,p_start date,p_end date) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM local_workers w WHERE w.id=p_worker AND w.is_active AND w.payroll_status='ACTIVE'
    AND (w.employment_start_date IS NULL OR w.employment_start_date<=p_end) AND (w.employment_end_date IS NULL OR w.employment_end_date>=p_start))
  OR EXISTS(
    SELECT 1 FROM (
      SELECT 'ATTENDANCE' kind,a.id,a.work_date FROM local_attendance a WHERE a.worker_id=p_worker AND a.workflow_status IN ('APPROVED','LOCKED') AND NOT a.is_reversed
      UNION ALL SELECT 'PRODUCTION_ENTRY',e.id,e.work_date FROM local_production_entries e WHERE e.worker_id=p_worker AND e.workflow_status IN ('APPROVED','LOCKED') AND NOT e.is_reversed
      UNION ALL SELECT 'OVERTIME',o.id,o.work_date FROM local_overtime o WHERE o.worker_id=p_worker AND o.status IN ('APPROVED','LOCKED')
      UNION ALL SELECT 'DAY_STATUS',d.id,d.work_date FROM local_day_statuses d WHERE d.worker_id=p_worker AND (d.status='PAID_LEAVE' OR (d.status='PRESENT' AND d.meal_eligible))
      UNION ALL SELECT 'PAYROLL_ADJUSTMENT',a.id,p.period_end FROM local_payroll_adjustments a JOIN local_payroll_periods p ON p.id=a.period_id WHERE a.worker_id=p_worker AND a.status='APPROVED' AND p.period_start=p_start AND p.period_end=p_end
    ) fact WHERE fact.work_date BETWEEN p_start AND p_end AND NOT EXISTS(
      SELECT 1 FROM local_payroll_items i JOIN local_payroll_records pr ON pr.id=i.payroll_record_id JOIN local_payroll_runs r ON r.id=pr.run_id
      WHERE r.status='LOCKED' AND i.source_type=fact.kind AND i.source_id=fact.id
    )
  );
$$;

-- Identity and numeric snapshot rows are immutable once their owning run is locked.
CREATE FUNCTION local_payroll_record_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_run uuid;
BEGIN
  IF TG_OP='INSERT' THEN owner_run:=NEW.run_id; ELSE owner_run:=OLD.run_id; END IF;
  IF EXISTS(SELECT 1 FROM local_payroll_runs WHERE id=owner_run AND status='LOCKED') THEN
    RAISE EXCEPTION 'Bản ghi bảng lương đã khóa là bất biến.';
  END IF;
  IF TG_OP='UPDATE' AND NEW.run_id<>OLD.run_id AND EXISTS(SELECT 1 FROM local_payroll_runs WHERE id=NEW.run_id AND status='LOCKED') THEN RAISE EXCEPTION 'Không chuyển bản ghi vào run đã khóa.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER payroll_record_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_records FOR EACH ROW EXECUTE FUNCTION local_payroll_record_snapshot_guard();

CREATE TRIGGER payroll_record_write_source_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_records FOR EACH STATEMENT EXECUTE FUNCTION local_lock_payroll_worker_write();
CREATE TRIGGER payroll_item_write_source_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_items FOR EACH STATEMENT EXECUTE FUNCTION local_lock_payroll_worker_write();
CREATE FUNCTION local_payroll_item_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_record uuid;
BEGIN
  IF TG_OP='INSERT' THEN owner_record:=NEW.payroll_record_id; ELSE owner_record:=OLD.payroll_record_id; END IF;
  IF EXISTS(SELECT 1 FROM local_payroll_records pr JOIN local_payroll_runs r ON r.id=pr.run_id WHERE pr.id=owner_record AND r.status='LOCKED') THEN RAISE EXCEPTION 'Chi tiết bảng lương đã khóa là bất biến.'; END IF;
  IF TG_OP='UPDATE' AND NEW.payroll_record_id<>OLD.payroll_record_id AND EXISTS(SELECT 1 FROM local_payroll_records pr JOIN local_payroll_runs r ON r.id=pr.run_id WHERE pr.id=NEW.payroll_record_id AND r.status='LOCKED') THEN RAISE EXCEPTION 'Không chuyển chi tiết vào run đã khóa.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER payroll_item_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_items FOR EACH ROW EXECUTE FUNCTION local_payroll_item_snapshot_guard();
CREATE FUNCTION local_payroll_locked_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='LOCKED' AND (TG_OP='DELETE' OR to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN RAISE EXCEPTION 'Run đã khóa là bất biến.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER payroll_locked_run_guard BEFORE UPDATE OR DELETE ON local_payroll_runs FOR EACH ROW EXECUTE FUNCTION local_payroll_locked_run_guard();
