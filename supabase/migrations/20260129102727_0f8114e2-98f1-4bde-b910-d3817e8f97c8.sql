-- Create an atomic RPC function to record fabric usage and transaction together
-- This prevents partial failures (usage recorded but transaction not, or vice versa)

CREATE OR REPLACE FUNCTION public.record_fabric_usage_and_transaction(
  p_order_id UUID,
  p_order_number TEXT,
  p_fabric_variant_id UUID,
  p_warehouse_id UUID,
  p_quantity_used NUMERIC,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_code TEXT DEFAULT NULL,
  p_order_type TEXT DEFAULT NULL,
  p_fabric_width TEXT DEFAULT NULL,
  p_usage_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_manager_id UUID;
  v_usage_id UUID;
  v_transaction_id UUID;
  v_result JSONB;
BEGIN
  -- Check authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please log in again.';
  END IF;

  -- Get user role
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'User role not found. Please contact administrator.';
  END IF;

  -- Only allow admin, manager, accountant, or employee roles
  IF v_user_role NOT IN ('admin', 'manager', 'accountant', 'employee') THEN
    RAISE EXCEPTION 'Permission denied. Role % cannot record fabric usage.', v_user_role;
  END IF;

  -- Determine manager_id based on role
  IF v_user_role = 'manager' THEN
    v_manager_id := v_user_id;
  ELSIF v_user_role IN ('employee', 'accountant') THEN
    -- Get assigned_by from user_roles
    SELECT assigned_by INTO v_manager_id
    FROM public.user_roles
    WHERE user_id = v_user_id;
  END IF;

  -- Validate required fields
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required.';
  END IF;

  IF p_fabric_variant_id IS NULL THEN
    RAISE EXCEPTION 'Fabric variant ID is required.';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse ID is required.';
  END IF;

  IF p_quantity_used IS NULL OR p_quantity_used <= 0 THEN
    RAISE EXCEPTION 'Quantity used must be greater than 0.';
  END IF;

  -- Insert into fabric_usage
  INSERT INTO public.fabric_usage (
    order_id,
    order_number,
    fabric_variant_id,
    warehouse_id,
    quantity_used,
    customer_name,
    customer_code,
    order_type,
    fabric_width,
    usage_date,
    notes,
    manager_id,
    unit
  ) VALUES (
    p_order_id,
    p_order_number,
    p_fabric_variant_id,
    p_warehouse_id,
    p_quantity_used,
    p_customer_name,
    p_customer_code,
    p_order_type,
    p_fabric_width,
    p_usage_date,
    p_notes,
    v_manager_id,
    'm'
  )
  RETURNING id INTO v_usage_id;

  -- Insert into fabric_transactions (outbound)
  INSERT INTO public.fabric_transactions (
    fabric_variant_id,
    warehouse_id,
    transaction_type,
    quantity,
    notes,
    transaction_date,
    manager_id,
    reference_number
  ) VALUES (
    p_fabric_variant_id,
    p_warehouse_id,
    'outbound',
    -p_quantity_used, -- Negative for outbound
    COALESCE(p_notes, 'Xuất vải cho đơn hàng ' || COALESCE(p_order_number, '') || ' - ' || COALESCE(p_customer_name, 'Khách hàng')),
    p_usage_date,
    v_manager_id,
    p_order_number
  )
  RETURNING id INTO v_transaction_id;

  -- NOTE: fabric_inventory is updated automatically by the existing trigger
  -- `update_fabric_inventory_on_usage` which fires AFTER INSERT on fabric_usage

  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'usage_id', v_usage_id,
    'transaction_id', v_transaction_id,
    'message', 'Fabric usage recorded successfully'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Return detailed error info
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'hint', 'Check if you have proper permissions and all required fields are valid.'
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.record_fabric_usage_and_transaction TO authenticated;