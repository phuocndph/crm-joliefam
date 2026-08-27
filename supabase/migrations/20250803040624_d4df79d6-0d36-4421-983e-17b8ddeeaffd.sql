-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to automatically update GHN tracking every hour
SELECT cron.schedule(
  'update-ghn-tracking-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-tracking',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{"action": "update_all_tracking"}'::jsonb
    ) as request_id;
  $$
);

-- Function to manually stop the cron job if needed
COMMENT ON EXTENSION pg_cron IS 'GHN tracking auto-update job scheduled to run every hour';

-- Check existing cron jobs
SELECT * FROM cron.job WHERE jobname = 'update-ghn-tracking-hourly';
