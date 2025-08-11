-- Ensure accountants can view all relevant fabric tables

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'warehouses' AND policyname = 'Accountants can view all warehouses'
  ) THEN
    CREATE POLICY "Accountants can view all warehouses"
    ON public.warehouses
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'accountant'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_variants' AND policyname = 'Accountants can view all fabric_variants'
  ) THEN
    CREATE POLICY "Accountants can view all fabric_variants"
    ON public.fabric_variants
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'accountant'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_transfers' AND policyname = 'Accountants can view all fabric_transfers'
  ) THEN
    CREATE POLICY "Accountants can view all fabric_transfers"
    ON public.fabric_transfers
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'accountant'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_usage' AND policyname = 'Accountants can view all fabric_usage'
  ) THEN
    CREATE POLICY "Accountants can view all fabric_usage"
    ON public.fabric_usage
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'accountant'));
  END IF;
END $$;