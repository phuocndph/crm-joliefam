-- Final ACL hardening for independent factory attendance.
-- Keep public signatures stable while limiting the attendance API to logged-in users.
BEGIN;

REVOKE ALL ON FUNCTION public.record_factory_attendance(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_factory_hour_attendance(
  uuid, date, time, time, integer, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_factory_attendance(
  uuid, text, date, numeric, numeric, numeric, numeric, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_factory_hour_attendance(
  uuid, date, time, time, integer, text, text, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_factory_attendance(uuid, text, text),
  public.list_factory_attendance_month(date, boolean),
  public.list_factory_attendance_month_v2(date, boolean),
  public.list_factory_attendance_month_v3(date, boolean),
  public.record_factory_overtime(uuid, date, text, integer, text, text),
  public.set_factory_attendance_status(uuid, text, text, text),
  public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text),
  public.set_factory_attendance_day_closure(uuid, date, text, text, text),
  public.set_factory_overtime_status(uuid, text, text, text),
  public.list_factory_attendance_closures(date),
  public.list_factory_overtime_month(date)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reverse_factory_attendance(uuid, text, text),
  public.list_factory_attendance_month(date, boolean),
  public.list_factory_attendance_month_v2(date, boolean),
  public.list_factory_attendance_month_v3(date, boolean),
  public.record_factory_overtime(uuid, date, text, integer, text, text),
  public.set_factory_attendance_status(uuid, text, text, text),
  public.set_factory_attendance_day_status(uuid, date, text, boolean, text, text),
  public.set_factory_attendance_day_closure(uuid, date, text, text, text),
  public.set_factory_overtime_status(uuid, text, text, text),
  public.list_factory_attendance_closures(date),
  public.list_factory_overtime_month(date)
TO authenticated;

COMMIT;
