

## Vấn đề

1. **Bảng chính**: Cột "Còn lại" chỉ tính `Tổng tiền - Đã thanh toán`, chưa trừ chi phí đơn hàng
2. **Bảng chính**: Thiếu cột "Chi phí" để người dùng thấy ngay chi phí của mỗi đơn
3. **Detail dialog**: Đã đúng (có trừ chi phí)

## Giải pháp

### 1. Load chi phí cho tất cả đơn hàng (không chỉ đơn đang xem)

Thêm state `allOrderExpenses` và fetch tất cả expenses có `order_id` khi load trang, tương tự cách đang fetch `orderPayments`. Query từ bảng `transactions` với `type = 'expense'` và có `order_id`.

### 2. Thêm cột "Chi phí" vào bảng chính

Thêm cột giữa "Đã thanh toán" và "Còn lại":
- Header: `Chi phí`
- Hiển thị tổng chi phí của đơn hàng đó (màu cam/đỏ)

### 3. Cập nhật `calculateRemainingAmount`

Sửa hàm để trừ thêm chi phí:
```
Còn lại = Tổng tiền - Đã thanh toán - Chi phí đơn hàng
```

### 4. Cập nhật `calculateRemainingAmount` cho form thanh toán

Đảm bảo form tạo thanh toán cũng nhận đúng số "Còn lại" đã trừ chi phí.

### Thay đổi file

- **`src/pages/TransactionManagement.tsx`**:
  - Thêm fetch expenses cho tất cả orders (trong `fetchOrders` hoặc riêng)
  - Thêm hàm `calculateOrderExpenses(orderId)`
  - Sửa `calculateRemainingAmount` trừ chi phí
  - Thêm cột "Chi phí" vào table header và body
  - Cập nhật `colSpan` từ 8 → 9

