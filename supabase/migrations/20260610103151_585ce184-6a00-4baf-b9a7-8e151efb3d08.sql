
ALTER TABLE public.einvoices 
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_payload jsonb,
  ADD COLUMN IF NOT EXISTS replaced_by_uuid text,
  ADD COLUMN IF NOT EXISTS replaces_uuid text,
  ADD COLUMN IF NOT EXISTS adjusted_by_uuid text,
  ADD COLUMN IF NOT EXISTS adjusts_uuid text,
  ADD COLUMN IF NOT EXISTS adjustment_type text,
  ADD COLUMN IF NOT EXISTS reservation_code text,
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE INDEX IF NOT EXISTS idx_einvoices_manager_draft_status 
  ON public.einvoices(manager_id, is_draft, status);
