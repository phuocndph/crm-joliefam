## Nguyên nhân

Trang sản phẩm đang chọn bảng giá **“Từ 01/5 Năm 2025 Đến Nay”**, trong database bảng giá này vẫn có **920 sản phẩm**. Nhưng chính sách bảo mật vừa sửa đã bỏ rule đọc sản phẩm theo bảng giá để chặn lộ `cost_price` giữa các quản lý. Vì vậy tài khoản không phải chủ `manager_id` của các sản phẩm đó sẽ nhìn thấy bảng giá nhưng không thấy sản phẩm.

## Kế hoạch sửa

1. **Tách dữ liệu sản phẩm để xem và để quản trị**
   - Giữ bảng gốc `products` chỉ cho admin/manager chủ sở hữu/nhân viên đúng tuyến xem đầy đủ, bao gồm `cost_price`.
   - Dùng view `products_public` đã có để cho người dùng đã đăng nhập xem catalog sản phẩm theo bảng giá nhưng **không có `cost_price`**.

2. **Sửa `ProductManagement.tsx` để không bị mất sản phẩm**
   - Khi người dùng có quyền xem giá vốn: query `products` như hiện tại.
   - Khi không có quyền xem giá vốn của bảng giá đang chọn: query `products_public` để vẫn hiện danh sách sản phẩm, giá bán, mã, quy cách, tồn kho.
   - Cột “Giá gốc” sẽ ẩn/hiển thị dấu `-` nếu dữ liệu đến từ `products_public`.
   - Các thao tác sửa/xóa/tạo sản phẩm vẫn chỉ dùng bảng `products` và để RLS chặn nếu không đủ quyền.

3. **Sửa các form chọn sản phẩm nếu cần**
   - `CreateQuoteForm` dùng `products_public` cho danh sách chọn sản phẩm vì báo giá không cần `cost_price`.
   - `CreateOrderForm` vẫn dùng `products` nếu cần tính giá vốn; nếu bị RLS chặn, fallback sang `products_public` với `cost_price = 0` để không mất danh sách sản phẩm.

4. **Kiểm tra lại dữ liệu thực tế**
   - Bảng giá 2025 phải hiển thị lại ~920 sản phẩm.
   - Không khôi phục policy cũ gây lộ `cost_price` qua mọi bảng giá.
   - Người không có quyền không thấy giá vốn, nhưng vẫn chọn/tra cứu được sản phẩm.