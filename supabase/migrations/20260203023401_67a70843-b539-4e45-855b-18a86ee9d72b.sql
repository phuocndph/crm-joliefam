-- Xóa policies cũ chỉ cho Admin
DROP POLICY IF EXISTS "Admins can insert template settings" ON quote_template_settings;
DROP POLICY IF EXISTS "Admins can update template settings" ON quote_template_settings;

-- Tạo policies mới cho Manager và Admin
CREATE POLICY "Managers can insert template settings"
ON quote_template_settings FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'manager')
  )
);

CREATE POLICY "Managers can update template settings"
ON quote_template_settings FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'manager')
  )
);

-- Bật Realtime cho bảng quote_template_settings
ALTER PUBLICATION supabase_realtime ADD TABLE quote_template_settings;