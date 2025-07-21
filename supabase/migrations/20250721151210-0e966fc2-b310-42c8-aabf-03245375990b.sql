-- Update transactions table to support order payments
ALTER TABLE public.transactions 
ADD COLUMN order_id UUID REFERENCES public.orders(id),
ADD COLUMN payment_type TEXT DEFAULT 'full',
ADD COLUMN installment_number INTEGER DEFAULT 1,
ADD COLUMN total_installments INTEGER DEFAULT 1,
ADD COLUMN remaining_amount NUMERIC DEFAULT 0;

-- Create order_payments table for detailed payment tracking
CREATE TABLE public.order_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_amount NUMERIC NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'deposit', -- 'deposit', 'installment', 'final', 'full'
  installment_number INTEGER DEFAULT 1,
  payment_method TEXT DEFAULT 'cash', -- 'cash', 'bank_transfer', 'card', 'other'
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for order_payments
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for order_payments
CREATE POLICY "Admins can view all order_payments" 
ON public.order_payments 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert order_payments" 
ON public.order_payments 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all order_payments" 
ON public.order_payments 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all order_payments" 
ON public.order_payments 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their order_payments" 
ON public.order_payments 
FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can insert their order_payments" 
ON public.order_payments 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can update their order_payments" 
ON public.order_payments 
FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

CREATE POLICY "Managers can delete their order_payments" 
ON public.order_payments 
FOR DELETE 
USING (has_role(auth.uid(), 'manager'::app_role) AND ((manager_id = (auth.uid())::text) OR (manager_id IS NULL)));

-- Create trigger for order_payments updated_at
CREATE TRIGGER update_order_payments_updated_at
BEFORE UPDATE ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update order payment status
CREATE OR REPLACE FUNCTION public.update_order_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid NUMERIC;
  order_total NUMERIC;
BEGIN
  -- Calculate total paid for this order
  SELECT COALESCE(SUM(payment_amount), 0) 
  INTO total_paid 
  FROM public.order_payments 
  WHERE order_id = NEW.order_id;
  
  -- Get order total amount
  SELECT total_amount 
  INTO order_total 
  FROM public.orders 
  WHERE id = NEW.order_id;
  
  -- Update order payment status based on total paid
  UPDATE public.orders 
  SET payment_status = 
    CASE 
      WHEN total_paid = 0 THEN 'pending'
      WHEN total_paid >= order_total THEN 'paid'
      ELSE 'partial'
    END,
    payment_date = 
      CASE 
        WHEN total_paid >= order_total THEN NEW.payment_date
        ELSE payment_date
      END
  WHERE id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update order payment status
CREATE TRIGGER update_order_payment_status_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_order_payment_status();

-- Create view for payment summary
CREATE OR REPLACE VIEW public.payment_summary AS
SELECT 
  o.id as order_id,
  o.order_number,
  o.total_amount,
  o.payment_status,
  o.payment_date as final_payment_date,
  c.name as customer_name,
  c.customer_code,
  COALESCE(SUM(op.payment_amount), 0) as total_paid,
  o.total_amount - COALESCE(SUM(op.payment_amount), 0) as remaining_amount,
  COUNT(op.id) as payment_count,
  MIN(op.payment_date) as first_payment_date,
  MAX(op.payment_date) as last_payment_date
FROM public.orders o
LEFT JOIN public.customers c ON o.customer_id = c.id
LEFT JOIN public.order_payments op ON o.id = op.order_id
GROUP BY o.id, o.order_number, o.total_amount, o.payment_status, o.payment_date, c.name, c.customer_code;