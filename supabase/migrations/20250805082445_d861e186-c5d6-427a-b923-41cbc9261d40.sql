-- Create triggers for fabric usage changes
CREATE TRIGGER trigger_update_order_notes_on_fabric_usage_insert
  AFTER INSERT ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_notes_on_fabric_usage();

CREATE TRIGGER trigger_update_order_notes_on_fabric_usage_update
  AFTER UPDATE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_notes_on_fabric_usage();

CREATE TRIGGER trigger_update_order_notes_on_fabric_usage_delete
  AFTER DELETE ON public.fabric_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_notes_on_fabric_usage_delete();