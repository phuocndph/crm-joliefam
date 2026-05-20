# Sửa cảnh báo trùng số đơn để mọi tài khoản đều thấy

## Vấn đề

Cảnh báo "Phát hiện X số đơn bị trùng" chỉ hiện với **admin/accountant**. Manager và nhân viên không thấy, vì:

- Hook `useOrdersStats(managerFilter)` query bảng `orders` có lọc theo `manager_id` (manager filter hoặc RLS).
- Các số trùng (2680–2687) thuộc về **2 manager khác nhau** (`3dc07420...` và `6a1faecc...`), nên trong "không gian" của mỗi manager mỗi số chỉ xuất hiện 1 lần → không phát hiện trùng.

Tuy nhiên trigger `auto_link_ghn_tracking_to_order` đếm `display_order_number` **toàn cục** (không lọc manager). Hai đơn cùng số khác manager vẫn làm GHN không tự liên kết được mã vận đơn. Vì vậy cảnh báo cần được hiện cho **mọi tài khoản** (kể cả manager/nhân viên), không chỉ admin.

## Giải pháp

### 1. Tạo RPC hoặc View để đếm trùng toàn cục, bỏ qua RLS

Tạo SECURITY DEFINER function `get_duplicate_display_order_numbers()` trả về danh sách số trùng trên toàn DB (không lọc theo manager, vì trigger GHN cũng đếm toàn cục).

```sql
CREATE OR REPLACE FUNCTION public.get_duplicate_display_order_numbers()
RETURNS TABLE(display_number text, dup_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT display_order_number, COUNT(*)::bigint
  FROM public.orders
  WHERE display_order_number ~ '^\d+$'
  GROUP BY display_order_number
  HAVING COUNT(*) > 1
  ORDER BY display_order_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_display_order_numbers() TO authenticated;
```

### 2. Tạo hook `useDuplicateOrderNumbers` riêng

File mới `src/hooks/useDuplicateOrderNumbers.ts` gọi `supabase.rpc('get_duplicate_display_order_numbers')`. Cache 2 phút.

### 3. Cập nhật `OrderManagement.tsx`

- Bỏ phần tính `duplicateOrderNumbers` từ `useOrdersStats`.
- Dùng `useDuplicateOrderNumbers()` để hiển thị cảnh báo (luôn toàn cục, mọi role).
- Cảnh báo bổ sung dòng nhỏ: "Số đơn có thể đang nằm ở quản lý khác — liên hệ admin để xử lý" cho manager/nhân viên không tìm thấy đơn trùng trong danh sách của mình.

### 4. Dọn `useOrdersStats.ts`

Xoá block tính `duplicateOrderNumbers` để giảm payload (vì đã chuyển sang RPC riêng).

## Kết quả

- Mọi tài khoản (admin, manager, accountant, nhân viên) đều thấy cảnh báo nếu có trùng `display_order_number` toàn cục.
- Manager biết số đơn của mình đang xung đột với manager khác, kể cả khi danh sách họ chỉ thấy 1 bản.
- GHN auto-link tiếp tục hoạt động không đổi.

## Phần kỹ thuật

| Thay đổi | File |
|---|---|
| Tạo SECURITY DEFINER function | migration mới |
| Hook mới gọi RPC | `src/hooks/useDuplicateOrderNumbers.ts` |
| Bỏ duplicateOrderNumbers khỏi stats | `src/hooks/useOrdersStats.ts` |
| Dùng hook mới + thêm gợi ý cho manager | `src/pages/OrderManagement.tsx` |
