-- Create customer predictions table
CREATE TABLE public.customer_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  prediction_type TEXT NOT NULL, -- 'purchase_probability', 'churn_risk', 'optimal_contact_time'
  prediction_value NUMERIC NOT NULL, -- score 0-100 for probability/risk, hour for contact time
  confidence_score NUMERIC DEFAULT 0, -- 0-100 confidence
  factors JSONB, -- factors that influenced the prediction
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id TEXT NOT NULL DEFAULT 'default'::text,
  manager_id TEXT
);

-- Enable RLS
ALTER TABLE public.customer_predictions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view predictions for their customers" 
ON public.customer_predictions 
FOR SELECT 
USING (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE (
      auth.uid()::text = manager_id OR 
      has_role(auth.uid(), 'admin'::app_role) OR
      (has_role(auth.uid(), 'employee'::app_role) AND manager_id IN (
        SELECT (assigned_by)::text FROM user_roles 
        WHERE user_id = auth.uid() AND role = 'employee'::app_role
      ))
    )
  )
);

CREATE POLICY "Users can insert predictions for their customers" 
ON public.customer_predictions 
FOR INSERT 
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE (
      auth.uid()::text = manager_id OR 
      has_role(auth.uid(), 'admin'::app_role) OR
      (has_role(auth.uid(), 'employee'::app_role) AND manager_id IN (
        SELECT (assigned_by)::text FROM user_roles 
        WHERE user_id = auth.uid() AND role = 'employee'::app_role
      ))
    )
  )
);

CREATE POLICY "Users can update predictions for their customers" 
ON public.customer_predictions 
FOR UPDATE 
USING (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE (
      auth.uid()::text = manager_id OR 
      has_role(auth.uid(), 'admin'::app_role) OR
      (has_role(auth.uid(), 'employee'::app_role) AND manager_id IN (
        SELECT (assigned_by)::text FROM user_roles 
        WHERE user_id = auth.uid() AND role = 'employee'::app_role
      ))
    )
  )
);

-- Add indexes for performance
CREATE INDEX idx_customer_predictions_customer_id ON public.customer_predictions(customer_id);
CREATE INDEX idx_customer_predictions_type ON public.customer_predictions(prediction_type);
CREATE INDEX idx_customer_predictions_valid_until ON public.customer_predictions(valid_until);

-- Create trigger for timestamps
CREATE TRIGGER update_customer_predictions_updated_at
BEFORE UPDATE ON public.customer_predictions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();