

## Ngày hẹn trả mặc định 6 ngày + bộ đếm ngược

### Hiện trạng
- Khi `delivery_date` là `null`, hiển thị "Chưa đặt"
- Bộ đếm ngược đã có sẵn cho các đơn có `delivery_date`
- `CreateOrderForm` không set `delivery_date` khi tạo đơn
- `EditOrderDialog` mặc định 4 ngày — cần đổi thành 6 ngày

### Thay đổi

**File: `src/components/InlineOrderEditTable.tsx`**
- Sửa `formatDateWithCountdown`: khi `delivery_date` là null, tự tính ngày mặc định = `created_at + 6 ngày` và hiển thị countdown tương tự (kèm ghi chú "mặc định")
- Truyền thêm `created_at` vào hàm để tính toán

**File: `src/components/CreateOrderForm.tsx`**
- Khi tạo đơn hàng, tự động set `delivery_date = created_at + 6 ngày`

**File: `src/components/EditOrderDialog.tsx`**
- Đổi default từ 4 ngày thành 6 ngày (dòng 66: `+ 4` → `+ 6`)

### Hiển thị bộ đếm ngược
- Quá hạn: `"12/04/2026 (Quá hạn 2 ngày)"` — đỏ đậm
- Hôm nay: `"12/04/2026 (Hôm nay)"` — đỏ
- Còn ≤ 2 ngày: `"14/04/2026 (Còn 2 ngày)"` — đỏ
- Còn > 2 ngày: `"18/04/2026 (Còn 7 ngày)"` — bình thường

