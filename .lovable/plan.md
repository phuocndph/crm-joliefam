

## Vấn đề

Khi xóa chi phí trong bảng chi phí (CashFlowManagement), chỉ xóa bản ghi trong bảng `expenses`, nhưng bản ghi tương ứng trong bảng `transactions` (type: 'expense', có order_id) vẫn còn. Dẫn đến cột "Chi phí" trong TransactionManagement vẫn hiển thị số tiền cũ.

## Giải pháp

Cập nhật hàm `handleDeleteExpense` trong `CashFlowManagement.tsx` để khi xóa expense, đồng thời xóa transaction liên quan.

### Cách xác định transaction liên quan

Khi tạo expense từ form thanh toán, transaction được tạo với:
- `type = 'expense'`
- `category = expense.category` (vd: 'shipping_fee')
- `description` chứa mã đơn hàng
- `amount = expense.amount`

Cách khớp tốt nhất: xóa transaction có `type = 'expense'`, `category` và `amount` trùng với expense, và `description` chứa cùng nội dung.

Tuy nhiên cách an toàn hơn là khớp theo `description` chính xác + `amount` + `type = 'expense'`.

### Thay đổi file

**`src/pages/CashFlowManagement.tsx`** - Sửa `handleDeleteExpense`:
1. Trước khi xóa expense, tìm và xóa transaction tương ứng trong bảng `transactions` dựa trên:
   - `type = 'expense'`
   - `amount = expense.amount`  
   - `description = expense.description`
2. Xóa expense như cũ
3. Invalidate cả query `['transactions']` và `['allOrderExpenses']` để cập nhật UI

