
-- Fix: Add full management permissions for accountants on fabric_transfers
-- (Currently accountants can only SELECT, causing RLS errors when creating transfers)

-- Drop the existing SELECT-only policy for accountants
DROP POLICY IF EXISTS "Accountants can view all fabric_transfers" ON public.fabric_transfers;

-- Create new ALL policy for accountants to manage fabric_transfers
CREATE POLICY "Accountants can manage all fabric_transfers" 
ON public.fabric_transfers 
FOR ALL 
USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

-- Clean up redundant SELECT policy for fabric_usage (ALL policy already covers SELECT)
DROP POLICY IF EXISTS "Accountants can view all fabric_usage" ON public.fabric_usage;
