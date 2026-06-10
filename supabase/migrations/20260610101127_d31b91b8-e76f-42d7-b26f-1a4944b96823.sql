
-- Settings table for Viettel S-Invoice account configuration (per manager)
CREATE TABLE IF NOT EXISTS public.einvoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id text NOT NULL UNIQUE,
  tax_code text,
  username text,
  password text, -- protected by RLS; only admin/manager of this row can read
  api_url text DEFAULT 'https://api-vinvoice.viettel.vn',
  default_invoice_type text DEFAULT '01GTKT',
  default_template_code text,
  default_serial text,
  last_login_at timestamptz,
  last_login_status text,
  last_login_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.einvoice_settings TO authenticated;
GRANT ALL ON public.einvoice_settings TO service_role;

ALTER TABLE public.einvoice_settings ENABLE ROW LEVEL SECURITY;

-- Admin sees all; manager sees own; accountant/employee see their manager's row
CREATE POLICY "einvoice_settings_select"
ON public.einvoice_settings FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR manager_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.assigned_by::text = einvoice_settings.manager_id
  )
);

CREATE POLICY "einvoice_settings_insert"
ON public.einvoice_settings FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'manager'::app_role) AND manager_id = auth.uid()::text)
);

CREATE POLICY "einvoice_settings_update"
ON public.einvoice_settings FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'manager'::app_role) AND manager_id = auth.uid()::text)
);

CREATE POLICY "einvoice_settings_delete"
ON public.einvoice_settings FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Safe view (no password) for frontend reads
CREATE OR REPLACE VIEW public.einvoice_settings_public
WITH (security_invoker = true)
AS
SELECT
  id, manager_id, tax_code, username, api_url,
  default_invoice_type, default_template_code, default_serial,
  last_login_at, last_login_status, last_login_error,
  (password IS NOT NULL AND length(password) > 0) AS has_password,
  created_at, updated_at
FROM public.einvoice_settings;

GRANT SELECT ON public.einvoice_settings_public TO authenticated;

CREATE TRIGGER trg_einvoice_settings_updated
BEFORE UPDATE ON public.einvoice_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
