
ALTER TABLE public.quote_template_settings
ADD COLUMN stamp_position jsonb DEFAULT '{"x": 5, "y": 50, "width": 160, "height": 160}'::jsonb,
ADD COLUMN signature_position jsonb DEFAULT '{"x": 30, "y": 45, "width": 140, "height": 100}'::jsonb;
