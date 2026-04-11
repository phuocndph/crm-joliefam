

## Vấn đề

Hiện tại, chi phí liên quan đến đơn hàng chỉ có thể tạo từ **form thanh toán** (CreatePaymentForm). Nếu muốn ghi nhận chi phí cho đơn hàng mà không cập nhật thanh toán, không có cách nào làm được.

Form tạo chi phí ở trang Chi phí (CashFlowManagement) chỉ tạo bản ghi trong bảng `expenses` - hoàn toàn độc lập, không liên kết với đơn hàng nào.

## Giải pháp

Thêm trường **"Đơn hàng liên quan"** (tùy chọn) vào form tạo chi phí (`CreateExpenseForm`). Khi chọn đơn hàng:
- Vẫn tạo bản ghi trong bảng `expenses` như bình thường
- **Đồng thời** tạo bản ghi trong bảng `transactions` với `type = 'expense'` và `order_id` = đơn hàng đã chọn
- Cột "Chi phí" và "Còn lại" trong trang Thanh toán sẽ tự động cập nhật

Khi **không chọn** đơn hàng: hoạt động y như cũ (chỉ tạo expense, không ảnh hưởng đơn hàng nào).

### Thay đổi file

**`src/components/CreateExpenseForm.tsx`**:
1. Thêm dropdown chọn đơn hàng (tùy chọn, không bắt buộc) - fetch danh sách đơn hàng từ bảng `orders`
2. Khi submit, nếu có chọn đơn hàng → tạo thêm bản ghi `transactions` với `type: 'expense'`, `order_id`, `amount`, `description` trùng với expense
3. Invalidate thêm queries `['transactions']` và `['allOrderExpenses']`

**`src/pages/CashFlowManagement.tsx`**:
- Cập nhật `handleCreateExpense` để invalidate thêm `['allOrderExpenses']`

