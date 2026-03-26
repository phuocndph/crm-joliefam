CREATE TRIGGER set_manager_id_einvoices
  BEFORE INSERT ON public.einvoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_manager_id();