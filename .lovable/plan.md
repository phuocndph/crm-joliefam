

# Kế hoạch: Thêm chức năng bật/tắt quyền duyệt báo giá cho nhân viên

## Mô tả

Hiện tại chỉ **Manager** và **Admin** mới thấy nút "Duyệt báo giá" và "Từ chối". Yêu cầu là thêm một permission mới để Manager/Admin có thể bật quyền này cho nhân viên cụ thể.

---

## Thay đổi cần thực hiện

### 1. Thêm permission type mới: `quote_approval`

**File: `src/hooks/useEmployeePermissions.tsx`**

Thêm `'quote_approval'` vào `PermissionType`:

```typescript
export type PermissionType = 
  | 'dashboard'
  | ...
  | 'quote_approval';  // MỚI
```

### 2. Thêm label cho permission mới

**File: `src/components/EmployeePermissionManagement.tsx`**

Thêm vào `permissionLabels`:

```typescript
quote_approval: 'Duyệt báo giá - Cho phép duyệt và từ chối báo giá'
```

### 3. Cập nhật điều kiện hiển thị nút Duyệt/Từ chối

**File: `src/pages/QuotesPage.tsx`** (Dòng 585 và 594)

Thay đổi điều kiện từ:
```tsx
{(userRole === 'manager' || userRole === 'admin') && quote.status === 'draft' && (
```

Thành:
```tsx
{(userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')) && quote.status === 'draft' && (
```

Áp dụng cho cả 2 nút: **Duyệt báo giá** (dòng 585) và **Từ chối** (dòng 594).

---

## Luồng hoạt động

```text
Manager vào Quản lý phân quyền
        ↓
Bật "Duyệt báo giá" cho nhân viên X
        ↓
Nhân viên X đăng nhập
        ↓
Thấy nút "Duyệt báo giá" và "Từ chối" trong menu
```

---

## File cần sửa

| File | Thay đổi |
|------|----------|
| `src/hooks/useEmployeePermissions.tsx` | Thêm `quote_approval` vào PermissionType |
| `src/components/EmployeePermissionManagement.tsx` | Thêm label cho permission mới |
| `src/pages/QuotesPage.tsx` | Cập nhật điều kiện hiển thị nút Duyệt/Từ chối |

Không cần migration database vì bảng `employee_permissions` lưu `permission_type` dạng text, không bị ràng buộc enum.

