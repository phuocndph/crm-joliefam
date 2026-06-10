DROP TRIGGER IF EXISTS set_einvoices_manager_id ON public.einvoices;
DROP TRIGGER IF EXISTS set_manager_id_einvoices ON public.einvoices;
DROP INDEX IF EXISTS public.einvoices_transaction_uuid_uniq;