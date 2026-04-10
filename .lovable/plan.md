

## Vấn đề

Bảng `ai_config` chỉ có RLS policy cho `admin` và `manager` đọc dữ liệu. Khi nhân viên dùng tính năng AI báo giá, edge function `lookup-tax-code` truy vấn `ai_config` bằng token của nhân viên → bị RLS chặn → dùng model mặc định thay vì model mà quản lý đã cấu hình.

## Giải pháp

Thêm RLS policy cho phép tất cả `authenticated` users đọc `ai_config`, vì đây là cấu hình chung (không chứa dữ liệu nhạy cảm), tương tự cách `contract_template_settings` cho phép mọi người đọc.

## Thực hiện

1. **Tạo migration** thêm RLS policy SELECT cho `authenticated` trên bảng `ai_config`:
```sql
CREATE POLICY "All authenticated users can read ai_config"
ON public.ai_config
FOR SELECT
TO authenticated
USING (true);
```

Chỉ cần 1 file migration, không cần sửa code frontend hay edge function vì logic đọc đã đúng — chỉ bị RLS chặn.

## Kỹ thuật

- Policy hiện tại `admin_manager_read` vẫn giữ nguyên (không ảnh hưởng)
- Policy mới chỉ mở SELECT, INSERT/UPDATE/DELETE vẫn giới hạn cho admin/manager
- Edge function sẽ tự động đọc được config đúng khi nhân viên gọi

