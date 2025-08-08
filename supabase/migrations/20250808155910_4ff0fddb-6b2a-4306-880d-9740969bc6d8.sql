-- Create a function to trigger the GHN auto-update
CREATE OR REPLACE FUNCTION trigger_ghn_auto_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the edge function using HTTP request
  PERFORM net.http_post(
    url := 'https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-auto-update',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
END;
$$;

-- Enable the pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function to run every hour
-- Note: This will be executed at minute 0 of every hour
SELECT cron.schedule(
  'ghn-auto-update-hourly',
  '0 * * * *', -- Every hour at minute 0
  'SELECT trigger_ghn_auto_update();'
);