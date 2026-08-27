-- Add person_name field to expenses table for tracking who made the expense
ALTER TABLE public.expenses 
ADD COLUMN person_name TEXT;

-- Update existing records to have a default person name
UPDATE public.expenses 
SET person_name = 'Không xác định' 
WHERE person_name IS NULL;