-- Backfill: copy manager_id from orders to order_payments where missing
UPDATE public.order_payments op
SET manager_id = o.manager_id
FROM public.orders o
WHERE op.order_id = o.id
AND op.manager_id IS NULL;

-- Create trigger function to auto-set manager_id from parent order
CREATE OR REPLACE FUNCTION public.set_order_payment_manager_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.manager_id IS NULL THEN
    SELECT manager_id INTO NEW.manager_id
    FROM public.orders
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER set_order_payment_manager_id_trigger
BEFORE INSERT ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_order_payment_manager_id();