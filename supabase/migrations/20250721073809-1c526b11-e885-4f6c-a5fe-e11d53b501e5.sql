-- Create price_lists table
CREATE TABLE public.price_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  manager_id TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on price_lists
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

-- Create policies for price_lists
CREATE POLICY "Users can view price_lists" 
ON public.price_lists 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert price_lists" 
ON public.price_lists 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update price_lists" 
ON public.price_lists 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete price_lists" 
ON public.price_lists 
FOR DELETE 
USING (true);

-- Add price_list_id to products table
ALTER TABLE public.products 
ADD COLUMN price_list_id UUID REFERENCES public.price_lists(id);

-- Add specifications field to products table (for quy cách)
ALTER TABLE public.products 
ADD COLUMN specifications TEXT;

-- Update existing products to have a default price list if needed
-- (This will be handled in the application logic)

-- Create trigger for price_lists updated_at
CREATE TRIGGER update_price_lists_updated_at
BEFORE UPDATE ON public.price_lists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();