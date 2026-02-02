

# Kế hoạch: Đơn giản hóa RLS cho Products, Quotes và Price Lists

## Mục tiêu

Bỏ tất cả RLS policies phức tạp và thay bằng policies đơn giản để **mọi tài khoản đăng nhập đều có thể truy cập** sản phẩm, báo giá và bảng giá.

---

## Policies hiện tại cần xóa

### Bảng `price_lists` (10 policies):
- Accountants can view all price_lists
- Admins can delete all price_lists
- Admins can insert price_lists
- Admins can update all price_lists
- Admins can view all price_lists
- Employees can view their manager's price_lists
- Managers can delete their price_lists
- Managers can insert their price_lists
- Managers can update their price_lists
- Managers can view their price_lists

### Bảng `products` (9 policies):
- Accountants can view products
- Admins can delete all products
- Admins can insert products
- Admins can update all products
- Admins can view all products
- Admins have full access to products
- Employees can manage their managers products
- Employees can view their manager's products
- Managers can manage their products

### Bảng `quotes` (11 policies):
- Accountants can manage all quotes
- Admins can delete all quotes
- Admins can insert quotes
- Admins can update all quotes
- Admins can view all quotes
- Employees can insert their manager's quotes
- Employees can update their manager's quotes
- Employees can view their manager's quotes
- Managers can delete their quotes
- Managers can insert their quotes
- Managers can update their quotes
- Managers can view their quotes

---

## Giải pháp

Thay thế tất cả bằng **3 policies đơn giản** cho mỗi bảng - cho phép authenticated users toàn quyền.

### SQL Migration:

```sql
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
```

---

## Kết quả mong đợi

| Bảng | Trước | Sau |
|------|-------|-----|
| `price_lists` | 10 policies phức tạp | 4 policies đơn giản (SELECT, INSERT, UPDATE, DELETE) |
| `products` | 9 policies phức tạp | 4 policies đơn giản |
| `quotes` | 11 policies phức tạp | 4 policies đơn giản |

| Chức năng | Admin | Manager | Employee | Accountant |
|-----------|-------|---------|----------|------------|
| Xem sản phẩm | ✅ | ✅ | ✅ | ✅ |
| Thêm/sửa/xóa sản phẩm | ✅ | ✅ | ✅ | ✅ |
| Xem bảng giá | ✅ | ✅ | ✅ | ✅ |
| Thêm/sửa/xóa bảng giá | ✅ | ✅ | ✅ | ✅ |
| Xem báo giá | ✅ | ✅ | ✅ | ✅ |
| Thêm/sửa/xóa báo giá | ✅ | ✅ | ✅ | ✅ |

---

## Lưu ý bảo mật

Sau khi thực hiện thay đổi này:
- **Mọi user đăng nhập** đều có thể xem, thêm, sửa, xóa dữ liệu trên 3 bảng này
- Nếu cần giới hạn quyền xóa cho một số role, có thể thêm lại logic sau trong UI (đã có sẵn trong QuotesPage.tsx)
- Trigger `set_manager_id` vẫn tự động gán manager_id khi tạo record mới

---

## Thứ tự thực hiện

1. **Migration** - Xóa tất cả policies cũ và tạo policies mới đơn giản
2. **Kiểm tra** - Đăng nhập với các tài khoản khác nhau để xác nhận đều truy cập được

