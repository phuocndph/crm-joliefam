
-- 1) Remove the cross-manager product exposure via price_list
DROP POLICY IF EXISTS "Users can view products in accessible price_lists" ON public.products;

-- 2) Tighten product-images storage write policies
DROP POLICY IF EXISTS "Users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete product images" ON storage.objects;

CREATE POLICY "Managers and admins can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

CREATE POLICY "Managers and admins can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

CREATE POLICY "Managers and admins can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

-- 3) Revoke EXECUTE on internal trigger SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_manager_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_order_manager_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_order_payment_manager_id() FROM anon, authenticated, PUBLIC;

-- 4) Restrict business RPC to authenticated only (not anon)
REVOKE EXECUTE ON FUNCTION public.record_fabric_usage_and_transaction(uuid, text, uuid, uuid, numeric, text, text, text, text, date, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_fabric_usage_and_transaction(uuid, text, uuid, uuid, numeric, text, text, text, text, date, text) TO authenticated;

-- 5) Require authentication for Realtime channel subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can use realtime"
ON realtime.messages FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can send realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can send realtime"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (true);
