## Lỗi: Không chọn được bảng giá khi tạo báo giá

### Nguyên nhân
Migration security gần nhất (`20260504013504`) đã siết RLS của `price_lists` và `products` xuống mức "manager chỉ thấy bản ghi của chính mình". Trong dữ liệu thực tế, **toàn bộ bảng giá và sản phẩm đều thuộc 1 manager gốc** (`3dc07420-...`), nên các manager/employee khác (vd `nguyenducphuoc@company.com`) bị chặn → dropdown rỗng → không tạo được báo giá.

Đây là dữ liệu dùng chung toàn công ty (catalog), không phải dữ liệu riêng từng manager → cần coi như chia sẻ nội bộ.

### Phương án sửa (migration mới)

Mở lại quyền **đọc** `price_lists` và `products` cho mọi user đã đăng nhập, nhưng giữ chặt quyền **ghi** (chỉ admin + manager sở hữu mới sửa được).

```sql
-- price_lists: cho mọi authenticated SELECT
DROP POLICY IF EXISTS "Managers can manage their price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Employees can manage their manager's price_lists" ON public.price_lists;
DROP POLICY IF EXISTS "Accountants can view all price_lists" ON public.price_lists;

CREATE POLICY "Authenticated can view price_lists"
  ON public.price_lists FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can write their price_lists"
  ON public.price_lists FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'manager') AND (manager_id = auth.uid()::text OR manager_id IS NULL));

CREATE POLICY "Managers can update their price_lists"
  ON public.price_lists FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'manager') AND manager_id = auth.uid()::text);

CREATE POLICY "Managers can delete their price_lists"
  ON public.price_lists FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'manager') AND manager_id = auth.uid()::text);

-- (Admin policy "Admins can manage all price_lists" giữ nguyên)
```

Áp dụng pattern y hệt cho **`products`**.

### Tác động

- Manager/employee mọi nơi đều xem được bảng giá + sản phẩm để tạo báo giá → fix lỗi ngay.
- Quyền sửa/xóa vẫn an toàn: chỉ admin hoặc manager sở hữu mới ghi được.
- API key/dữ liệu nhạy cảm (`ai_config`, `user_roles`) vẫn được giữ chặt như đã siết.

### Ghi chú memory
Cập nhật `@security-memory`: `price_lists` và `products` là **shared catalog**, SELECT mở cho mọi authenticated; chỉ ghi mới giới hạn theo manager. Tránh re-flag.

### File sẽ thay đổi
- Tạo migration mới (1 file SQL)
- Cập nhật security memory
