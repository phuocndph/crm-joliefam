-- Ensure admins can view all fabric-related data regardless of manager scoping
-- This adds SELECT policies for admins on key fabric tables if they do not already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_types' AND policyname = 'Admins can view all fabric_types'
  ) THEN
    CREATE POLICY "Admins can view all fabric_types"
    ON public.fabric_types
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_variants' AND policyname = 'Admins can view all fabric_variants'
  ) THEN
    CREATE POLICY "Admins can view all fabric_variants"
    ON public.fabric_variants
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_widths' AND policyname = 'Admins can view all fabric_widths'
  ) THEN
    CREATE POLICY "Admins can view all fabric_widths"
    ON public.fabric_widths
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'warehouses' AND policyname = 'Admins can view all warehouses'
  ) THEN
    CREATE POLICY "Admins can view all warehouses"
    ON public.warehouses
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_inventory' AND policyname = 'Admins can view all fabric_inventory'
  ) THEN
    CREATE POLICY "Admins can view all fabric_inventory"
    ON public.fabric_inventory
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_transactions' AND policyname = 'Admins can view all fabric_transactions'
  ) THEN
    CREATE POLICY "Admins can view all fabric_transactions"
    ON public.fabric_transactions
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_transfers' AND policyname = 'Admins can view all fabric_transfers'
  ) THEN
    CREATE POLICY "Admins can view all fabric_transfers"
    ON public.fabric_transfers
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fabric_usage' AND policyname = 'Admins can view all fabric_usage'
  ) THEN
    CREATE POLICY "Admins can view all fabric_usage"
    ON public.fabric_usage
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;