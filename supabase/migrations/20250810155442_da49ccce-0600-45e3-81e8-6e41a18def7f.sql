-- Update RLS policies for products table to allow shared access like price_lists
-- Drop existing manager-specific policies
DROP POLICY IF EXISTS "Managers can view their products" ON public.products;
DROP POLICY IF EXISTS "Managers can insert their products" ON public.products;
DROP POLICY IF EXISTS "Managers can update their products" ON public.products;
DROP POLICY IF EXISTS "Managers can delete their products" ON public.products;

-- Drop existing employee policies  
DROP POLICY IF EXISTS "Employees can view their manager's products" ON public.products;

-- Create new shared policies for products (similar to price_lists)
CREATE POLICY "Users can view products" 
ON public.products 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert products" 
ON public.products 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update products" 
ON public.products 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete products" 
ON public.products 
FOR DELETE 
USING (true);