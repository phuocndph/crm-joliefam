## Kế hoạch sửa lỗi nhân đôi sản phẩm

### Vấn đề đang thấy
- Bảng giá **“Từ 01/5 Năm 2025 Đến Nay”** hiện có đúng **920 dòng** trong database, nhưng bị chia theo nhiều `manager_id`: 890 + 29 + 1.
- Chính sách vừa thêm **“Authenticated can view products = true”** làm người dùng nhìn thấy sản phẩm của nhiều manager trong cùng một bảng giá, nên giao diện trông như bị nhân đôi / lẫn dữ liệu.
- Ảnh bạn gửi có các dòng cùng nhóm sản phẩm nhưng giá/quy cách khác nhau; phần này có thể là dữ liệu từ các manager khác bị lộ chung vào một bảng giá, không phải lỗi render của bảng.

### Cách sửa
1. **Thu hồi chính sách xem quá rộng trên `products`**
   - Xóa policy cho phép toàn bộ user đăng nhập xem toàn bộ sản phẩm.
   - Khôi phục phạm vi đúng theo vai trò:
     - Admin/Accountant: xem toàn bộ nếu đúng nghiệp vụ hiện tại.
     - Manager: xem sản phẩm của chính mình.
     - Employee/Staff: xem sản phẩm thuộc manager được phân công.

2. **Đồng bộ dữ liệu bảng giá “Từ 01/5 Năm 2025 Đến Nay” theo đúng owner**
   - Kiểm tra manager sở hữu bảng giá là `3dc07420...` nhưng 890 sản phẩm đang thuộc `4b2f1f05...` và 29 sản phẩm thuộc `6a1faecc...`.
   - Chọn hướng an toàn: chỉ hiển thị theo `manager_id` hợp lệ với người dùng hiện tại; không xóa dữ liệu ngay.
   - Nếu cần sửa dữ liệu thật sau khi bạn xác nhận, sẽ chuyển các sản phẩm đúng về cùng manager của bảng giá hoặc tách bảng giá theo manager.

3. **Sửa truy vấn trang Quản lý sản phẩm để không cộng lẫn dữ liệu giữa các manager**
   - Với user không phải Admin/Accountant, query sản phẩm sẽ lọc theo `manager_id` phù hợp với role.
   - Count phân trang cũng dùng cùng điều kiện lọc để không còn báo sai tổng số.
   - PGRST103 vẫn được giữ xử lý fallback trang hợp lệ.

4. **Kiểm tra lại sau sửa**
   - Vào bảng giá “Từ 01/5 Năm 2025 Đến Nay”.
   - Xác nhận tổng sản phẩm không còn cộng lẫn 890 + 29 + 1.
   - Kiểm tra các mã ví dụ như `BVDCBT-1M`, `BVDCBT-1M2`, `BVDCBT-1M4` không bị hiện thêm dòng từ manager khác.

### Ghi chú cần bạn xác nhận khi triển khai
- Nếu mục tiêu của bạn là bảng giá này phải có **đúng 920 sản phẩm cho tất cả người dùng**, thì phải chuẩn hóa lại `manager_id` của dữ liệu.
- Nếu mục tiêu là mỗi manager chỉ thấy sản phẩm của mình, thì sau sửa một số user sẽ thấy **890**, user khác thấy **29**, chứ không cộng thành 920 nữa.