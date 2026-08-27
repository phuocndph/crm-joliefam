-- Update customers table to support multiple phones and addresses
ALTER TABLE public.customers 
ADD COLUMN customer_code TEXT,
ADD COLUMN phones JSONB DEFAULT '[]'::jsonb,
ADD COLUMN addresses JSONB DEFAULT '[]'::jsonb,
ADD COLUMN purchase_count INTEGER DEFAULT 0,
ADD COLUMN last_purchase_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN total_spent NUMERIC DEFAULT 0,
ADD COLUMN auto_tags TEXT[] DEFAULT '{}';

-- Update orders table to support more detailed order management
ALTER TABLE public.orders 
ADD COLUMN delivery_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN payment_status TEXT DEFAULT 'pending',
ADD COLUMN payment_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN cost_price NUMERIC DEFAULT 0,
ADD COLUMN profit_before NUMERIC DEFAULT 0,
ADD COLUMN profit_after NUMERIC DEFAULT 0;

-- Create expenses table for cost management
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_code TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  expense_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for expenses table
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for expenses
CREATE POLICY "Admins can view all expenses" 
ON public.expenses 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert expenses" 
ON public.expenses 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all expenses" 
ON public.expenses 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all expenses" 
ON public.expenses 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for expenses updated_at
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update customer stats
CREATE OR REPLACE FUNCTION public.update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update customer purchase stats when order is completed
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    UPDATE public.customers 
    SET 
      purchase_count = purchase_count + 1,
      last_purchase_date = NEW.updated_at,
      total_spent = total_spent + COALESCE(NEW.total_amount, 0)
    WHERE id = NEW.customer_id;
    
    -- Update auto tags based on purchase count
    UPDATE public.customers 
    SET auto_tags = 
      CASE 
        WHEN purchase_count = 1 THEN ARRAY['Đã Mua']
        WHEN purchase_count = 2 THEN ARRAY['Đã Mua lần 2']
        WHEN purchase_count = 3 THEN ARRAY['Đã Mua lần 3']
        WHEN purchase_count > 3 THEN ARRAY['KHTT']
        ELSE auto_tags
      END
    WHERE id = NEW.customer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update customer stats
CREATE TRIGGER update_customer_stats_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_stats();

-- Create function to calculate profit
CREATE OR REPLACE FUNCTION public.calculate_order_profit()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate profit when order is updated
  NEW.profit_before = COALESCE(NEW.total_amount, 0) - COALESCE(NEW.cost_price, 0);
  
  -- For profit after, we'll subtract a percentage of expenses (simplified)
  NEW.profit_after = NEW.profit_before - (COALESCE(NEW.cost_price, 0) * 0.1);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to calculate profit
CREATE TRIGGER calculate_order_profit_trigger
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.calculate_order_profit();