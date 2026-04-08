CREATE TABLE public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  config_value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_read" ON public.ai_config
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_write" ON public.ai_config
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_update" ON public.ai_config
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_delete" ON public.ai_config
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));