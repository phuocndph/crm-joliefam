-- Semantic source revision; historical confirmations deliberately remain NULL.
CREATE TABLE local_attendance_day_revisions (
 worker_id uuid NOT NULL REFERENCES local_workers(id), work_date date NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), PRIMARY KEY(worker_id,work_date)
);
ALTER TABLE local_day_closures ADD COLUMN confirmed_revision bigint,
 ADD COLUMN confirmation_actor_id text, ADD COLUMN confirmation_kind text CHECK(confirmation_kind IN ('SELF','PROXY')),
 ADD COLUMN confirmation_reason text, ADD COLUMN confirmed_at timestamptz;
CREATE TABLE local_attendance_day_action_receipts (
 idempotency_key text PRIMARY KEY, actor_id text NOT NULL, fingerprint text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION local_attendance_semantic_fact(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT (p - ARRAY['created_at','updated_at','local_modified_at','is_snapshot_record','idempotency_key','idempotency_fingerprint','workflow_at','workflow_actor_id','workflow_reason','workflow_status','status'])
 || jsonb_build_object('_excluded',coalesce(p->>'workflow_status',p->>'status','') IN ('REJECTED','REVERSED'))
 || CASE WHEN coalesce(p->>'workflow_status',p->>'status','') IN ('REJECTED','REVERSED') THEN jsonb_build_object('_rejection_reason',p->'workflow_reason') ELSE '{}'::jsonb END
 || CASE WHEN p ? 'meal_eligible' THEN jsonb_build_object('status',p->>'status') ELSE '{}'::jsonb END;
$$;
CREATE FUNCTION local_attendance_bump_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_fact jsonb; new_fact jsonb; wid uuid; day date;
BEGIN
 IF TG_OP<>'INSERT' THEN old_fact:=local_attendance_semantic_fact(to_jsonb(OLD)); END IF;
 IF TG_OP<>'DELETE' THEN new_fact:=local_attendance_semantic_fact(to_jsonb(NEW)); END IF;
 IF old_fact IS NOT DISTINCT FROM new_fact THEN RETURN NULL; END IF;
 FOR wid,day IN SELECT DISTINCT (p->>'worker_id')::uuid,(p->>'work_date')::date FROM unnest(ARRAY[old_fact,new_fact]) p WHERE p IS NOT NULL ORDER BY 1,2 LOOP
  PERFORM local_lock_attendance_source_write(wid,day);
  INSERT INTO local_attendance_day_revisions(worker_id,work_date,revision) VALUES(wid,day,1)
   ON CONFLICT(worker_id,work_date) DO UPDATE SET revision=local_attendance_day_revisions.revision+1;
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER attendance_semantic_revision AFTER INSERT OR UPDATE OR DELETE ON local_attendance FOR EACH ROW EXECUTE FUNCTION local_attendance_bump_revision();
CREATE TRIGGER production_semantic_revision AFTER INSERT OR UPDATE OR DELETE ON local_production_entries FOR EACH ROW EXECUTE FUNCTION local_attendance_bump_revision();
CREATE TRIGGER overtime_semantic_revision AFTER INSERT OR UPDATE OR DELETE ON local_overtime FOR EACH ROW EXECUTE FUNCTION local_attendance_bump_revision();
CREATE TRIGGER day_status_semantic_revision AFTER INSERT OR UPDATE OR DELETE ON local_day_statuses FOR EACH ROW EXECUTE FUNCTION local_attendance_bump_revision();
CREATE FUNCTION local_guard_day_confirmation_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rev bigint; pending boolean; classified boolean;
BEGIN
 -- Preserve already sealed history and idempotency-only metadata updates.
 IF NEW.status NOT IN ('EMPLOYEE_CONFIRMED','LEADER_CONFIRMED') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['idempotency_fingerprint','updated_at'])=(to_jsonb(OLD)-ARRAY['idempotency_fingerprint','updated_at']) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status='LEADER_CONFIRMED' AND NEW.status=OLD.status THEN RAISE EXCEPTION 'Ngày đã chốt; cần mở lại có lý do trước khi đổi xác nhận.'; END IF;
 PERFORM local_lock_attendance_source_write(NEW.worker_id,NEW.work_date);
 SELECT coalesce((SELECT revision FROM local_attendance_day_revisions WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date),0) INTO rev;
 IF NEW.confirmation_actor_id IS NULL OR NEW.confirmation_kind IS NULL OR (NEW.confirmation_kind='PROXY' AND nullif(btrim(NEW.confirmation_reason),'') IS NULL) THEN RAISE EXCEPTION 'Xác nhận phải có người thực hiện; xác nhận hộ bắt buộc lý do.'; END IF;
 IF NEW.confirmed_revision IS NULL OR NEW.confirmed_revision<>rev THEN RAISE EXCEPTION 'Xác nhận ngày đã cũ; tải lại toàn bộ nguồn và xác nhận lại.'; END IF;
 SELECT EXISTS(SELECT 1 FROM local_attendance WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date AND NOT is_reversed AND workflow_status='SUBMITTED'
 UNION ALL SELECT 1 FROM local_production_entries WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date AND NOT is_reversed AND workflow_status='SUBMITTED'
 UNION ALL SELECT 1 FROM local_overtime WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date AND status='SUBMITTED') INTO pending;
 SELECT EXISTS(SELECT 1 FROM local_attendance WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date AND NOT is_reversed AND workflow_status NOT IN ('REJECTED','REVERSED')
 UNION ALL SELECT 1 FROM local_production_entries WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date AND NOT is_reversed AND workflow_status NOT IN ('REJECTED','REVERSED')
 UNION ALL SELECT 1 FROM local_overtime WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date AND status NOT IN ('REJECTED','REVERSED')
 UNION ALL SELECT 1 FROM local_day_statuses WHERE worker_id=NEW.worker_id AND work_date=NEW.work_date) INTO classified;
 IF NOT classified THEN RAISE EXCEPTION 'Ngày chưa có nguồn hoặc trạng thái để xác nhận.'; END IF;
 IF NEW.status='LEADER_CONFIRMED' THEN
  IF pending THEN RAISE EXCEPTION 'Ngày còn nguồn chờ duyệt; xử lý công, sản lượng và tăng ca trước khi chốt.'; END IF;
  IF TG_OP='INSERT' OR OLD.status<>'EMPLOYEE_CONFIRMED' OR OLD.confirmed_revision IS DISTINCT FROM NEW.confirmed_revision THEN RAISE EXCEPTION 'Cần xác nhận hiện hành trước khi chốt ngày.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER day_confirmation_revision_guard BEFORE INSERT OR UPDATE ON local_day_closures FOR EACH ROW EXECUTE FUNCTION local_guard_day_confirmation_revision();
