-- Add RLS policies to allow accountants to view user_roles and profiles for manager selection
CREATE POLICY "Accountants can view all user_roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Add RLS policy to allow accountants to view all profiles
CREATE POLICY "Accountants can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'accountant'::app_role));