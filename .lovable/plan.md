

## Thêm cột "Mã Vận Đơn" vào bảng đơn hàng

### Phân tích
- Dữ liệu mã vận đơn nằm trong bảng `ghn_tracking`, liên kết với orders qua `order_id`, trường `ghn_order_code`.
- Hiện tại query orders trong `useOrders.ts` chưa join `ghn_tracking`.
- Cần join thêm và hiển thị cột mới trong `InlineOrderEditTable`.

### Các file cần sửa

**1. `src/hooks/useOrders.ts`**
- Thêm `ghn_tracking(ghn_order_code)` vào select query để lấy mã vận đơn theo từng đơn hàng.

**2. `src/components/InlineOrderEditTable.tsx`**
- Thêm field `ghn_tracking` vào interface `Order`:
  ```tsx
  ghn_tracking?: { ghn_order_code: string }[];
  ```
- Thêm cột header "Mã Vận Đơn" sau cột "Mã đơn hàng" (hoặc vị trí phù hợp).
- Thêm TableCell hiển thị danh sách mã vận đơn. Nếu 1 đơn có nhiều mã GHN, hiển thị từng mã trên 1 dòng. Nếu chưa có thì để trống.
- Màu nền cell theo row status như các cột khác.

### Kết quả
- Cột "Mã Vận Đơn" hiển thị mã GHN tracking code của từng đơn hàng, giống hình mẫu user gửi.

