
# Kế hoạch: Sửa lỗi nhân viên không xem được bảng giá

## Nguyên nhân gốc

Sau khi kiểm tra database, tôi phát hiện:

| Manager ID | Role | Có bảng giá không? |
|------------|------|-------------------|
| `3dc07420-d21d-411e-9b00-758178ecf100` | Admin | ✅ Có 7 bảng giá |
| `6a1faecc-8571-46ca-a035-01efe09c919b` | Manager | ❌ Không có bảng giá nào |

### Nhân viên được gán cho manager nào?
| Employee | Assigned to Manager |
|----------|---------------------|
| `7485f2b7-...` | `6a1faecc-...` (Manager) |
| `b5421b2d-...` | `6a1faecc-...` (Manager) |

### RLS Policy hiện tại
```sql
-- Nhân viên chỉ xem được bảng giá của manager họ được gán
Employees can view their manager's price_lists:
  manager_id IN (SELECT assigned_by FROM user_roles WHERE user_id = auth.uid())
```

**Kết quả**: Nhân viên được gán cho manager `6a1faecc-...` → không có bảng giá → hiển thị rỗng!

---

## Giải pháp đề xuất

Có 2 cách tiếp cận:

### Cách 1: Cho nhân viên xem bảng giá của Admin (Khuyến nghị)

Thêm logic: Nhân viên có thể xem bảng giá của **manager được gán** HOẶC **bảng giá của admin**.

**SQL Migration:**
```sql
DROP POLICY IF EXISTS "Employees can view their manager's price_lists" ON price_lists;

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
```

**Ưu điểm:** Nhân viên có thể làm việc ngay, không cần tạo lại dữ liệu

**Nhược điểm:** Nhân viên có thể xem tất cả bảng giá của admin

### Cách 2: Tạo bảng giá riêng cho Manager

Giữ nguyên RLS policy, chỉ cần Manager `6a1faecc-...` tạo bảng giá mới.

**Ưu điểm:** Dữ liệu tách biệt hoàn toàn giữa các manager

**Nhược điểm:** Phải nhập lại sản phẩm vào bảng giá mới

---

## Thay đổi cần thực hiện (Cách 1)

### File 1: `supabase/migrations/[new].sql`

Cập nhật RLS policy để cho phép nhân viên xem bảng giá của admin:

```sql
-- Drop existing employee policy
DROP POLICY IF EXISTS "Employees can view their manager's price_lists" ON price_lists;

-- Create new policy: employees can view their manager's OR admin's price lists
CREATE POLICY "Employees can view their manager's price_lists"
  ON price_lists FOR SELECT
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
```

---

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| Nhân viên không thấy bảng giá nào | Nhân viên thấy bảng giá của admin |
| Dropdown trống | Dropdown có 7 bảng giá |
| Không thể tạo báo giá | Có thể chọn bảng giá và tạo báo giá |

---

## Thứ tự thực hiện

1. **Migration** - Cập nhật RLS policy để cho phép xem bảng giá của admin
2. **Kiểm tra** - Đăng nhập với tài khoản nhân viên để xác nhận xem được bảng giá

---

## Lưu ý kỹ thuật

- Không cần thay đổi code frontend, chỉ cần sửa RLS policy
- Nhân viên vẫn chỉ có thể INSERT/UPDATE với manager_id được tự động set qua trigger
- Logic này đảm bảo nhân viên có thể làm việc ngay cả khi manager chưa tạo bảng giá riêng
