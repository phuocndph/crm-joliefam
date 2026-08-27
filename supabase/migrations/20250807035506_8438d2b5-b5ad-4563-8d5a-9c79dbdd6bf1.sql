-- Add assignee_id column to quotes table
ALTER TABLE public.quotes 
ADD COLUMN assignee_id UUID REFERENCES public.assignees(id);

-- Add assignee_id column to orders table  
ALTER TABLE public.orders
ADD COLUMN assignee_id UUID REFERENCES public.assignees(id);

-- Create indexes for better performance
CREATE INDEX idx_quotes_assignee_id ON public.quotes(assignee_id);
CREATE INDEX idx_orders_assignee_id ON public.orders(assignee_id);