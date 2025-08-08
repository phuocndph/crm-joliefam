-- Step 2: add RLS policies for accountant across business tables

-- customers
CREATE POLICY "Accountants can manage all customers"
ON public.customers
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- orders
CREATE POLICY "Accountants can manage all orders"
ON public.orders
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- quotes
CREATE POLICY "Accountants can manage all quotes"
ON public.quotes
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- GHN tracking
CREATE POLICY "Accountants can manage all GHN tracking data"
ON public.ghn_tracking
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- finance_data (Dòng tiền)
CREATE POLICY "Accountants can manage all finance_data"
ON public.finance_data
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- transactions (Giao dịch)
CREATE POLICY "Accountants can manage all transactions"
ON public.transactions
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- expenses (Chi phí)
CREATE POLICY "Accountants can manage all expenses"
ON public.expenses
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- fabric types/widths (Danh mục vải)
CREATE POLICY "Accountants can manage all fabric_types"
ON public.fabric_types
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can manage all fabric_widths"
ON public.fabric_widths
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- fabric inventory & transactions & usage (Kho vải)
CREATE POLICY "Accountants can manage all fabric_inventory"
ON public.fabric_inventory
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can manage all fabric_transactions"
ON public.fabric_transactions
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can manage all fabric_usage"
ON public.fabric_usage
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'accountant'));

-- assignees: allow read so accountant can work with orders/quotes selections
CREATE POLICY "Accountants can view assignees"
ON public.assignees
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'accountant'));
