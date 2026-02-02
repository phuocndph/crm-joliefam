-- Drop existing employee policy for price_lists
DROP POLICY IF EXISTS "Employees can view their manager's price_lists" ON price_lists;

-- Create new policy: employees can view their manager's OR admin's price lists
CREATE POLICY "Employees can view their manager's price_lists"
  ON price_lists FOR SELECT
  USING (
    has_role(auth.uid(), 'employee'::app_role) AND (
      -- Bảng giá của manager được gán
      manager_id IN (
        SELECT (assigned_by)::text FROM user_roles 
        WHERE user_id = auth.uid() AND role = 'employee'::app_role
      )
      OR
      -- Bảng giá của admin (để nhân viên vẫn có thể làm việc)
      manager_id IN (
        SELECT (user_id)::text FROM user_roles WHERE role = 'admin'::app_role
      )
    )
  );

-- Also update products policy to match (so employees can see products from admin's price lists)
DROP POLICY IF EXISTS "Employees can view their manager's products" ON products;

CREATE POLICY "Employees can view their manager's products"
  ON products FOR SELECT
  USING (
    has_role(auth.uid(), 'employee'::app_role) AND (
      manager_id IN (
        SELECT (assigned_by)::text FROM user_roles 
        WHERE user_id = auth.uid() AND role = 'employee'::app_role
      )
      OR
      manager_id IN (
        SELECT (user_id)::text FROM user_roles WHERE role = 'admin'::app_role
      )
    )
  );