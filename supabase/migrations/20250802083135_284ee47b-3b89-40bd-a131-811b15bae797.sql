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
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtteGZsanhzbW5venZ2Z3lwZGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5Nzg1MzcsImV4cCI6MjA2ODU1NDUzN30.fbXXKCAS1j1ohxuvqx7W1A-0UwIyhoJ820Umrk7sbnI"}'::jsonb,
        body:='{"action": "bulk_sync"}'::jsonb
    ) as request_id;
  $$
);