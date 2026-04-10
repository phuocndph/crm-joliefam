CREATE POLICY "All authenticated users can read ai_config"
ON public.ai_config
FOR SELECT
TO authenticated
USING (true);