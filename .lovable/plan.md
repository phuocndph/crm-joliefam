

# Kế hoạch: Cho phép Manager lưu Template và Đồng bộ Realtime cho Nhân viên

## Tình trạng hiện tại

| Tính năng | Trạng thái |
|-----------|------------|
| **RLS INSERT/UPDATE** | Chỉ cho Admin |
| **RLS SELECT** | Tất cả authenticated users |
| **Realtime subscription** | Chưa được bật cho bảng này |

## Yêu cầu

1. **Manager và Admin** có thể tạo và lưu cài đặt Template
2. **Nhân viên** chỉ xem được - không chỉnh sửa
3. **Dữ liệu đồng bộ realtime** - khi Manager/Admin lưu, Nhân viên thấy ngay lập tức

---

## Thay đổi cần thực hiện

### Phần 1: Cập nhật RLS Policies (Database)

Xóa policies cũ chỉ cho Admin và tạo policies mới cho phép Manager:

```sql
-- Xóa policies cũ
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
```

### Phần 2: Bật Realtime cho bảng quote_template_settings

```sql
-- Thêm bảng vào Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE quote_template_settings;
```

### Phần 3: Cập nhật Frontend - useTemplateSettings Hook

Thêm realtime subscription để nhân viên nhận được cập nhật ngay lập tức:

```typescript
// Trong useTemplateSettings.ts
useEffect(() => {
  fetchSettings();
  
  // Setup realtime subscription
  const channel = supabase
    .channel(`template-settings-${Date.now()}`)
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'quote_template_settings',
        filter: "tenant_id=eq.default"
      },
      (payload) => {
        console.log('Template settings changed:', payload);
        fetchSettings(); // Re-fetch when data changes
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## File cần sửa

| File | Thay đổi |
|------|----------|
| **Database Migration** | Cập nhật RLS policies và bật Realtime |
| **src/hooks/useTemplateSettings.ts** | Thêm realtime subscription |

---

## Kết quả mong đợi

| Vai trò | Xem cài đặt | Lưu cài đặt | Nhận realtime update |
|---------|-------------|-------------|---------------------|
| Admin | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ |
| Employee | ✅ | ❌ | ✅ (auto-refresh) |
| Accountant | ✅ | ❌ | ✅ (auto-refresh) |

---

## Luồng hoạt động

```text
Manager/Admin lưu cài đặt
        ↓
Database UPDATE thành công
        ↓
Realtime trigger phát sự kiện
        ↓
Tất cả client (Employee) nhận event
        ↓
fetchSettings() chạy lại
        ↓
UI tự động cập nhật
```

---

## Thứ tự thực hiện

1. **Migration** - Cập nhật RLS policies (cho Manager) và bật Realtime
2. **Sửa useTemplateSettings.ts** - Thêm realtime subscription
3. **Kiểm tra** - Đăng nhập 2 tài khoản (Manager + Employee) để test đồng bộ

