-- Remove employee delete permission on quotes
-- Employees can only: SELECT, INSERT, UPDATE (not DELETE)
DROP POLICY IF EXISTS "Employees can delete their manager's quotes" ON quotes;