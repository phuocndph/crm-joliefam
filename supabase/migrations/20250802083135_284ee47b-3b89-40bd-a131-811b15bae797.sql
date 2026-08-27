-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to sync GHN tracking data every hour
SELECT cron.schedule(
  'ghn-tracking-hourly-sync',
  '0 * * * *', -- every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-tracking',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{"action": "bulk_sync"}'::jsonb
    ) as request_id;
  $$
);
