-- Forward fix for migration 027: idempotent seed/bootstrap inserts must remain
-- safe after a period is locked. API insert paths already check lock state;
-- the database trigger is reserved for update/delete mutations.
DROP TRIGGER IF EXISTS local_attendance_locked_payroll_guard ON local_attendance;
CREATE TRIGGER local_attendance_locked_payroll_guard
  BEFORE UPDATE OR DELETE ON local_attendance
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_production_entry_locked_payroll_guard ON local_production_entries;
CREATE TRIGGER local_production_entry_locked_payroll_guard
  BEFORE UPDATE OR DELETE ON local_production_entries
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_overtime_locked_payroll_guard ON local_overtime;
CREATE TRIGGER local_overtime_locked_payroll_guard
  BEFORE UPDATE OR DELETE ON local_overtime
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_day_status_locked_payroll_guard ON local_day_statuses;
CREATE TRIGGER local_day_status_locked_payroll_guard
  BEFORE UPDATE OR DELETE ON local_day_statuses
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();

DROP TRIGGER IF EXISTS local_day_closure_locked_payroll_guard ON local_day_closures;
CREATE TRIGGER local_day_closure_locked_payroll_guard
  BEFORE UPDATE OR DELETE ON local_day_closures
  FOR EACH ROW EXECUTE FUNCTION local_reject_locked_payroll_source_mutation();
