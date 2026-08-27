-- Aggregate quote cards in Postgres and authenticate the scheduled GHN scanner.
-- Deployment prerequisite: create a Supabase Vault secret named
-- `ghn-cron-secret` and deploy the Edge Function with the same value as
-- `GHN_CRON_SECRET`. Do not put the secret in SQL or source control.

CREATE OR REPLACE FUNCTION public.get_quote_stats(p_manager_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'sent', COUNT(*) FILTER (WHERE q.status = 'sent'),
    'approved', COUNT(*) FILTER (WHERE q.status = 'approved'),
    'total_value', COALESCE(SUM(q.total_amount), 0)::numeric
  )
  FROM public.quotes AS q
  WHERE p_manager_id IS NULL
     OR p_manager_id = 'all'
     OR q.manager_id::text = p_manager_id;
$$;

REVOKE ALL ON FUNCTION public.get_quote_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_stats(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.trigger_ghn_auto_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ghn-cron-secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'GHN cron secret is not configured';
  END IF;

  PERFORM net.http_post(
    url := 'https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-auto-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ghn-cron-secret', v_secret
    ),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_ghn_auto_update() FROM PUBLIC, anon, authenticated;
