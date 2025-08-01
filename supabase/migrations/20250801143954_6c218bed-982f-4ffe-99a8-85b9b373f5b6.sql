-- Create AI settings table
CREATE TABLE public.ai_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  setting_name TEXT NOT NULL,
  setting_value BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id TEXT NOT NULL DEFAULT 'default'::text,
  manager_id TEXT,
  UNIQUE(user_id, setting_name, tenant_id)
);

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for AI settings
CREATE POLICY "Users can view their own AI settings" 
ON public.ai_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI settings" 
ON public.ai_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI settings" 
ON public.ai_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI settings" 
ON public.ai_settings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins can manage all AI settings
CREATE POLICY "Admins can view all AI settings" 
ON public.ai_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert AI settings" 
ON public.ai_settings 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all AI settings" 
ON public.ai_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all AI settings" 
ON public.ai_settings 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Managers can manage their subordinates' settings
CREATE POLICY "Managers can view their employees AI settings" 
ON public.ai_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'manager'::app_role) AND (manager_id = (auth.uid())::text OR manager_id IS NULL));

CREATE POLICY "Managers can insert their employees AI settings" 
ON public.ai_settings 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update their employees AI settings" 
ON public.ai_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'manager'::app_role) AND (manager_id = (auth.uid())::text OR manager_id IS NULL));

CREATE POLICY "Managers can delete their employees AI settings" 
ON public.ai_settings 
FOR DELETE 
USING (has_role(auth.uid(), 'manager'::app_role) AND (manager_id = (auth.uid())::text OR manager_id IS NULL));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default AI settings
INSERT INTO public.ai_settings (user_id, setting_name, setting_value, tenant_id) 
SELECT 
  id as user_id,
  'auto_classify' as setting_name,
  false as setting_value,
  'default' as tenant_id
FROM auth.users
ON CONFLICT (user_id, setting_name, tenant_id) DO NOTHING;

INSERT INTO public.ai_settings (user_id, setting_name, setting_value, tenant_id) 
SELECT 
  id as user_id,
  'interaction_suggestions' as setting_name,
  false as setting_value,
  'default' as tenant_id
FROM auth.users
ON CONFLICT (user_id, setting_name, tenant_id) DO NOTHING;

INSERT INTO public.ai_settings (user_id, setting_name, setting_value, tenant_id) 
SELECT 
  id as user_id,
  'sentiment_analysis' as setting_name,
  false as setting_value,
  'default' as tenant_id
FROM auth.users
ON CONFLICT (user_id, setting_name, tenant_id) DO NOTHING;