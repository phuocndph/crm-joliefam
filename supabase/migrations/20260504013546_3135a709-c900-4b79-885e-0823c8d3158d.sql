CREATE OR REPLACE FUNCTION public.trigger_ghn_auto_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Only allow admins/managers to invoke from a logged-in session.
  -- Background/cron callers run as postgres/supabase_admin and bypass this check.
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin'::app_role)
              OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Permission denied: admin or manager role required';
  END IF;

  PERFORM net.http_post(
    url := 'https://kmxfljxsmnozvvgypdei.supabase.co/functions/v1/ghn-auto-update',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_ghn_auto_update() FROM PUBLIC, anon, authenticated;