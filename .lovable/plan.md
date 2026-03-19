

## Thêm thông tin chi tiết đơn hàng vào dialog Thanh toán

### Vấn đề
Dialog "Chi tiết Thanh toán" hiện chỉ hiển thị thông tin thanh toán (tổng tiền, đã thanh toán, còn lại, lịch sử thanh toán). Người dùng phải chuyển sang tab Đơn hàng để xem chi tiết đơn hàng như khách hàng, sản phẩm, ngày giao, trạng thái, ghi chú.

### Giải pháp
Mở rộng dialog thanh toán để hiển thị thêm thông tin đơn hàng ngay bên trong, chia thành 2 phần rõ ràng.

### Thay đổi cụ thể

**File:** `src/pages/TransactionManagement.tsx`

1. **Mở rộng query** để lấy thêm dữ liệu: `customers` (thêm `email`, `address`, `company`), và `assignees` (tên người phụ trách)
   - Cập nhật select query thêm: `assignees:assignee_id(name)`, customer fields: `email, address, company`

2. **Cập nhật Order interface** thêm các fields: `items`, `notes`, `delivery_date`, `status`, `assignee_id`, và nested `assignees`

3. **Thêm phần "Thông tin đơn hàng"** vào dialog trước phần thanh toán:
   - Khách hàng: tên, SĐT, email, địa chỉ, công ty
   - Đơn hàng: số đơn, trạng thái, ngày tạo, ngày giao
   - Người phụ trách
   - Ghi chú đơn hàng
   - Bảng danh sách sản phẩm (từ `items` JSON): tên SP, quy cách, số lượng, đơn giá, thành tiền

4. **Layout dialog**: Dùng Tabs hoặc sections phân chia:
   - Section 1: "Thông tin đơn hàng" - grid hiển thị thông tin khách + đơn hàng + bảng sản phẩm
   - Section 2: "Thanh toán" - giữ nguyên phần summary + lịch sử thanh toán hiện tại

### Không thay đổi
- Logic thanh toán, form thêm thanh toán
- Các trang khác
- Database schema

