-- Additive local integrity guards. No salary formula or historical snapshot is changed.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['local_workers','local_worker_compensation_assignments','local_worker_payroll_profiles','local_worker_rates','local_social_insurance_versions','local_attendance','local_production_entries','local_overtime','local_day_statuses','local_day_closures','local_payroll_adjustments','local_payroll_policy_groups','local_payroll_policies','local_product_rates','local_products']
  LOOP
    EXECUTE format('CREATE TRIGGER payroll_snapshot_source_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION local_lock_payroll_worker_write()', table_name);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION local_reject_locked_payroll_source_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM local_payroll_runs r JOIN local_payroll_periods p ON p.id=r.period_id
    WHERE r.status='LOCKED' AND (
      (TG_OP <> 'INSERT' AND OLD.work_date BETWEEN p.period_start AND p.period_end)
      OR (TG_OP <> 'DELETE' AND NEW.work_date BETWEEN p.period_start AND p.period_end)
    )
  ) THEN
    RAISE EXCEPTION 'Nguồn chấm công/sản lượng đã thuộc kỳ lương bị khóa.' USING ERRCODE='P0001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION local_guard_payroll_adjustment_period()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid; v_closed boolean;
BEGIN
  IF TG_OP='DELETE' THEN v_period:=OLD.period_id; ELSE v_period:=NEW.period_id; END IF;
  -- The statement source guard excludes concurrent payroll close. Do not take
  -- a period row lock here after the adjustment row: API writers lock period
  -- first, and reversing that order can deadlock otherwise safe mutations.
  SELECT status='CLOSED' INTO v_closed FROM local_payroll_periods WHERE id=v_period;
  IF TG_OP='UPDATE' AND OLD.period_id IS DISTINCT FROM NEW.period_id THEN
    RAISE EXCEPTION 'Không được chuyển điều chỉnh sang kỳ khác.';
  END IF;
  IF v_closed THEN
    IF TG_OP='UPDATE' AND OLD.status='APPROVED' AND NEW.status='LOCKED'
      AND (to_jsonb(NEW)-ARRAY['status','locked_run_id','locked_at','updated_at']) = (to_jsonb(OLD)-ARRAY['status','locked_run_id','locked_at','updated_at'])
      AND EXISTS(SELECT 1 FROM local_payroll_runs r JOIN local_payroll_records pr ON pr.run_id=r.id JOIN local_payroll_items i ON i.payroll_record_id=pr.id
        WHERE r.id=NEW.locked_run_id AND r.period_id=v_period AND r.status='LOCKED' AND i.source_type='PAYROLL_ADJUSTMENT' AND i.source_id=NEW.id)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Kỳ lương đã đóng; hãy tạo kỳ điều chỉnh riêng.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payroll_adjustment_period_guard BEFORE INSERT OR UPDATE OR DELETE ON local_payroll_adjustments FOR EACH ROW EXECUTE FUNCTION local_guard_payroll_adjustment_period();
