-- Add missing fields to fabric_usage table for better tracking
ALTER TABLE public.fabric_usage 
ADD COLUMN order_type text,
ADD COLUMN fabric_width text;

-- Update the unit column default to 'm' (meters) instead of 'kg'
ALTER TABLE public.fabric_usage 
ALTER COLUMN unit SET DEFAULT 'm';

-- Update existing records to use meters if they were in kg
UPDATE public.fabric_usage 
SET unit = 'm' 
WHERE unit = 'kg';

-- Add comment to clarify the new fields
COMMENT ON COLUMN public.fabric_usage.order_type IS 'Type of order like Phước, Hoan, etc.';
COMMENT ON COLUMN public.fabric_usage.fabric_width IS 'Width of the fabric used';