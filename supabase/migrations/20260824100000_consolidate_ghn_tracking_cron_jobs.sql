-- Keep one GHN scanner. Earlier migrations created three hourly jobs that
-- queried the same tracking records through different function actions.
-- This migration only changes scheduler metadata; it does not modify CRM data.
DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'ghn-tracking-hourly-sync',
      'update-ghn-tracking-hourly',
      'ghn-auto-update-hourly'
    )
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'ghn-auto-update-hourly',
  '0 * * * *',
  'SELECT public.trigger_ghn_auto_update();'
);
