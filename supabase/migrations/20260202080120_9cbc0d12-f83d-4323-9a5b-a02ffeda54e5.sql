-- ============================================
-- XÓA TẤT CẢ RLS POLICIES CHO price_lists
-- ============================================
DROP POLICY IF EXISTS "Accountants can view all price_lists" ON price_lists;
DROP POLICY IF EXISTS "Admins can delete all price_lists" ON price_lists;
DROP POLICY IF EXISTS "Admins can insert price_lists" ON price_lists;
DROP POLICY IF EXISTS "Admins can update all price_lists" ON price_lists;
DROP POLICY IF EXISTS "Admins can view all price_lists" ON price_lists;
DROP POLICY IF EXISTS "Employees can view their manager's price_lists" ON price_lists;
DROP POLICY IF EXISTS "Managers can delete their price_lists" ON price_lists;
DROP POLICY IF EXISTS "Managers can insert their price_lists" ON price_lists;
DROP POLICY IF EXISTS "Managers can update their price_lists" ON price_lists;
DROP POLICY IF EXISTS "Managers can view their price_lists" ON price_lists;

-- ============================================
-- XÓA TẤT CẢ RLS POLICIES CHO products
-- ============================================
DROP POLICY IF EXISTS "Accountants can view products" ON products;
DROP POLICY IF EXISTS "Admins can delete all products" ON products;
DROP POLICY IF EXISTS "Admins can insert products" ON products;
DROP POLICY IF EXISTS "Admins can update all products" ON products;
DROP POLICY IF EXISTS "Admins can view all products" ON products;
DROP POLICY IF EXISTS "Admins have full access to products" ON products;
DROP POLICY IF EXISTS "Employees can manage their managers products" ON products;
DROP POLICY IF EXISTS "Employees can view their manager's products" ON products;
DROP POLICY IF EXISTS "Managers can manage their products" ON products;

-- ============================================
-- XÓA TẤT CẢ RLS POLICIES CHO quotes
-- ============================================
DROP POLICY IF EXISTS "Accountants can manage all quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can delete all quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can insert quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can update all quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can view all quotes" ON quotes;
DROP POLICY IF EXISTS "Employees can insert their manager's quotes" ON quotes;
DROP POLICY IF EXISTS "Employees can update their manager's quotes" ON quotes;
DROP POLICY IF EXISTS "Employees can view their manager's quotes" ON quotes;
DROP POLICY IF EXISTS "Managers can delete their quotes" ON quotes;
DROP POLICY IF EXISTS "Managers can insert their quotes" ON quotes;
DROP POLICY IF EXISTS "Managers can update their quotes" ON quotes;
DROP POLICY IF EXISTS "Managers can view their quotes" ON quotes;

-- ============================================
-- TẠO POLICIES ĐƠN GIẢN - CHO TẤT CẢ AUTHENTICATED USERS
-- ============================================

-- Price Lists: Authenticated users có toàn quyền
CREATE POLICY "Authenticated users can view price_lists"
  ON price_lists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert price_lists"
  ON price_lists FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update price_lists"
  ON price_lists FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete price_lists"
  ON price_lists FOR DELETE
  TO authenticated
  USING (true);

-- Products: Authenticated users có toàn quyền
CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (true);

-- Quotes: Authenticated users có toàn quyền
CREATE POLICY "Authenticated users can view quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert quotes"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (true);