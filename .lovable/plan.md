

## Kết quả kiểm tra

### Tính toán đúng
Đơn hàng #2622 đang hiển thị đúng công thức:
- Tổng tiền: 4,470,000
- Đã thanh toán: 1,000,000
- Chi phí: 100,000
- Còn lại: 3,370,000 ✓

### Vấn đề phát hiện

**1. Orphaned transaction (giao dịch mồ côi)**
Hiện tại trong DB, bảng `expenses` không có bản ghi nào cho đơn #2622 (có thể đã bị xóa trước đó), nhưng bản ghi transaction `type=expense` vẫn còn (100,000đ). Điều này cho thấy lần xóa trước đó đã xảy ra **trước** khi code sync được triển khai.

**2. Matching logic có thể không khớp với dữ liệu cũ**
Code hiện tại match transaction bằng `description` + `amount` + `type='expense'`. Tuy nhiên dữ liệu cũ (ví dụ đơn 2560) có format khác: expense có `description` rỗng và `category` = "Phí vận chuyển đơn 2560", trong khi transaction mới có `description` = "Phí vận chuyển đơn hàng #2622" và `category` = "shipping_fee". Với dữ liệu mới từ form thanh toán, cả hai bảng dùng cùng description nên matching sẽ hoạt động đúng.

### Giải pháp đề xuất

1. **Dọn dẹp orphaned transaction** cho đơn #2622: Xóa bản ghi transaction `type=expense` mồ côi (id: `aa1e281d-...`) vì expense tương ứng đã không còn trong bảng expenses.

2. **Code sync đã đúng cho dữ liệu mới**: Từ giờ khi tạo chi phí qua form thanh toán, cả expenses và transactions đều dùng cùng `description`, nên logic xóa sẽ match chính xác.

### Thay đổi cần thực hiện

- **Migration SQL**: Xóa orphaned transaction cho đơn #2622 (`DELETE FROM transactions WHERE id = 'aa1e281d-9fce-4853-8e60-39f8b8960bb6'`)
- Hoặc người dùng có thể tự tạo lại chi phí rồi xóa lại để test flow mới

