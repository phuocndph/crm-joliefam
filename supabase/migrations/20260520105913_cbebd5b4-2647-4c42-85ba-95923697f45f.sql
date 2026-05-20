-- 1. Remove overly permissive product SELECT via price_lists (leaks cost_price across managers)
DROP POLICY IF EXISTS "Users can view products in accessible price_lists" ON public.products;

-- 2. Add DELETE policy on logos storage bucket for admin/manager
CREATE POLICY "Admins and managers can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);