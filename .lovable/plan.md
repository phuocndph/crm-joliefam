## Vấn đề xác định được

- Trong database, bảng giá `Từ 01/5 Năm 2025 Đến Nay` hiện có **920 sản phẩm**.
- Nhưng phân theo `manager_id`:
  - **890 dòng** thuộc manager `4b2f...`
  - **29 dòng** thuộc manager `6a1...`
  - **1 dòng** thuộc admin/chủ bảng giá `3dc...`
- Frontend không đếm sai: nó đang nhận đúng phần dữ liệu mà RLS cho user hiện tại thấy.
- Gốc lỗi là dữ liệu import đã bị gán `manager_id` không đồng nhất với `price_lists.manager_id`, trong khi RLS sản phẩm đang lọc theo `products.manager_id`. Vì vậy cùng một bảng giá nhưng mỗi tài khoản chỉ thấy một mảnh dữ liệu khác nhau.

## Kế hoạch sửa

1. **Sửa dữ liệu hiện tại cho bảng giá 01/05/2025**
   - Đồng bộ toàn bộ `products.manager_id` của bảng giá này về đúng `price_lists.manager_id`.
   - Sau khi sửa, user có quyền với bảng giá này sẽ thấy đủ 920 dòng thay vì 29.

2. **Chặn tái diễn ở Edge Function import-products**
   - Khi import, không lấy `manager_id` từ người bấm import nữa.
   - Luôn đọc `price_lists.manager_id` của `priceListId` được chọn và gán sản phẩm theo owner của bảng giá đó.
   - Với employee/accountant/admin import hộ, sản phẩm vẫn đi vào đúng owner của bảng giá.

3. **Củng cố RLS để bảng giá và sản phẩm đi cùng nhau**
   - Thêm/điều chỉnh policy đọc sản phẩm theo quyền truy cập bảng giá tương ứng, thay vì chỉ phụ thuộc `products.manager_id`.
   - Giữ nguyên ràng buộc bảo mật theo role; không mở public.

4. **Sửa UI hiển thị thống kê để tránh gây hiểu nhầm**
   - Sau khi load, thống kê vẫn dùng count từ DB nhưng thêm cảnh báo nếu count trả về thấp bất thường so với bảng giá đã import.
   - Sau import, toast sẽ nói rõ: đọc bao nhiêu dòng, lưu bao nhiêu SKU, bỏ/gộp bao nhiêu dòng.

5. **Xác minh sau sửa**
   - Query lại database: bảng giá 01/05/2025 phải có toàn bộ sản phẩm cùng owner.
   - Kiểm tra lại trang `/products`: tổng dòng không còn là 29 cho bảng giá này.
   - Kiểm tra import mới: sản phẩm mới không còn bị gán owner theo người thao tác sai bảng giá.