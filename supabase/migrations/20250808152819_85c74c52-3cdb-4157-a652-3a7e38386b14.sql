-- Step 1: add new role value first (must be its own migration)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';