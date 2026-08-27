\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS auth;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee', 'accountant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_type)
);

CREATE TABLE IF NOT EXISTS public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Sản phẩm local',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS specifications text,
  ADD COLUMN IF NOT EXISTS in_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manager_id text,
  ADD COLUMN IF NOT EXISTS price_list_id uuid,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS images jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  manager_id text,
  tenant_id text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS public.expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS public.transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS public.order_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS public.finance_data (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL DEFAULT 'default');
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  warehouse_type text NOT NULL DEFAULT 'main',
  is_active boolean NOT NULL DEFAULT true,
  manager_id text,
  tenant_id text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fabric_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_name text NOT NULL,
  unit text NOT NULL DEFAULT 'm',
  tenant_id text NOT NULL DEFAULT 'default'
);

-- Mirror the read privilege present on legacy Supabase tables. The inventory
-- compatibility trigger runs as the authenticated caller when validating a
-- fabric bridge in the local staging stack.
GRANT SELECT ON public.fabric_variants TO authenticated;
GRANT SELECT ON public.user_roles, public.employee_permissions, public.products, public.price_lists TO authenticated;

-- Local acceptance fixtures are provisioned through the local service role.
-- Application users still exercise the normal authenticated grants and RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.user_roles,
  public.employee_permissions,
  public.warehouses,
  public.products,
  public.price_lists
TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
