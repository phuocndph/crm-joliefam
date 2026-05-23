## Mục tiêu
Khắc phục trang Sản phẩm đang hiển thị 0 dòng cho người dùng không sở hữu `manager_id` của bảng giá, nhưng vẫn không để lộ `cost_price`.

## Kế hoạch thực hiện
1. **Thêm RPC đọc catalog công khai an toàn**
   - Tạo function đọc sản phẩm theo bảng giá với `SECURITY DEFINER`.
   - Function chỉ trả các cột cần hiển thị catalog và **không trả `cost_price`**.
   - Hỗ trợ lọc theo bảng giá, tìm kiếm, danh mục, tồn kho, phân trang và tổng số dòng.

2. **Sửa trang `ProductManagement`**
   - Giữ query trực tiếp `products` cho admin/manager/accountant có quyền xem đủ dữ liệu.
   - Khi query trực tiếp trả 0 do RLS, gọi RPC catalog để lấy sản phẩm không có `cost_price`.
   - Sửa luôn phần đếm tổng dòng/phân trang để không còn hiện 0 khi fallback có dữ liệu.

3. **Sửa nơi chọn sản phẩm khi tạo báo giá**
   - Nếu query `products` trả rỗng, gọi RPC catalog để danh sách sản phẩm vẫn hiện.
   - Gán `cost_price = null/0` ở frontend cho dữ liệu catalog để không phá UI cũ.

4. **Kiểm tra lại**
   - Xác nhận bảng giá “Từ 01/5 Năm 2025 Đến Nay” hiển thị ~920 sản phẩm.
   - Đảm bảo `cost_price` không bị lộ qua đường fallback.

## Chi tiết kỹ thuật
- Không khôi phục policy đọc trực tiếp toàn bảng `products` vì sẽ làm lộ giá vốn.
- `products_public` hiện là `security_invoker`, nên vẫn bị RLS của bảng gốc chặn; vì vậy cần RPC có kiểm soát thay vì view fallback hiện tại.