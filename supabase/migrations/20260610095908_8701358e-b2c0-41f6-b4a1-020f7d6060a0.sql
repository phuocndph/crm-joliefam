-- 1. Add new columns to einvoices
ALTER TABLE public.einvoices
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS original_invoice_id uuid REFERENCES public.einvoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_action text DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS payment_status_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_code text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_to text;

CREATE UNIQUE INDEX IF NOT EXISTS einvoices_transaction_uuid_uniq
  ON public.einvoices (transaction_uuid)
  WHERE transaction_uuid IS NOT NULL;

-- 2. Audit log table
CREATE TABLE IF NOT EXISTS public.einvoice_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  einvoice_id uuid REFERENCES public.einvoices(id) ON DELETE SET NULL,
  action text NOT NULL,
  request jsonb,
  response jsonb,
  status text,
  error_message text,
  created_by uuid,
  manager_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.einvoice_actions TO authenticated;
GRANT ALL ON public.einvoice_actions TO service_role;

ALTER TABLE public.einvoice_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all einvoice actions"
  ON public.einvoice_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view own einvoice actions"
  ON public.einvoice_actions FOR SELECT TO authenticated
  USING (manager_id = (auth.uid())::text);

CREATE POLICY "Staff can view manager's einvoice actions"
  ON public.einvoice_actions FOR SELECT TO authenticated
  USING (manager_id IN (
    SELECT (assigned_by)::text FROM public.user_roles
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Authenticated can insert einvoice actions"
  ON public.einvoice_actions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS einvoice_actions_einvoice_idx ON public.einvoice_actions(einvoice_id);
CREATE INDEX IF NOT EXISTS einvoice_actions_manager_idx ON public.einvoice_actions(manager_id);