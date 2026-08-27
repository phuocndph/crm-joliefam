-- Add RLS policies for accountants to manage fabric_variants (INSERT, UPDATE, DELETE)
CREATE POLICY "Accountants can manage all fabric_variants" 
ON public.fabric_variants 
FOR ALL 
USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

-- Drop the existing SELECT-only policy for accountants as the ALL policy covers it
DROP POLICY IF EXISTS "Accountants can view all fabric_variants" ON public.fabric_variants;