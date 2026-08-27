-- Update ghn_tracking table for comprehensive tracking
ALTER TABLE public.ghn_tracking 
ADD COLUMN IF NOT EXISTS internal_order_code TEXT,
ADD COLUMN IF NOT EXISTS customer_name_raw TEXT,
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS tracking_notes TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_ghn_tracking_internal_order_code ON public.ghn_tracking(internal_order_code);
CREATE INDEX IF NOT EXISTS idx_ghn_tracking_ghn_order_code ON public.ghn_tracking(ghn_order_code);

-- Add trigger to update last_updated_at
CREATE OR REPLACE FUNCTION update_ghn_tracking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ghn_tracking_updated_at
  BEFORE UPDATE ON public.ghn_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_ghn_tracking_timestamp();

-- Update RLS policies to ensure employees can only modify their manager's tracking data
CREATE POLICY "Employees can insert their manager's GHN tracking data" 
ON public.ghn_tracking 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'employee'::app_role) AND 
  (manager_id IN ( 
    SELECT (user_roles.assigned_by)::text AS assigned_by
    FROM user_roles
    WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'employee'::app_role))
  ))
);