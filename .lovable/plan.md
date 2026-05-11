## Vấn đề thực tế

Trang không còn lỗi PGRST103, nhưng số sản phẩm đang sai vì dữ liệu của bảng giá **“Từ 01/5 Năm 2025 Đến Nay”** đang nằm trong cùng một `price_list_id` nhưng bị chia theo nhiều `manager_id`:

- `4b2f1f05...`: 890 sản phẩm
- `6a1faecc...`: 29 sản phẩm
- `3dc07420...`: 1 sản phẩm
- Tổng đúng trong bảng giá: 920 sản phẩm

RLS hiện tại cho manager chỉ thấy sản phẩm có `manager_id = auth.uid()`, nên user đang đăng nhập thuộc manager có 29 sản phẩm thì UI chỉ hiện **29**, không thể hiện 920.

## Kế hoạch sửa

1. **Không mở lại policy quá rộng kiểu `true`**
   - Không dùng lại policy “Authenticated can view all products” vì đó là nguyên nhân trước làm lẫn/nhân đôi dữ liệu giữa manager.

2. **Sửa quyền xem sản phẩm theo bảng giá được phép xem**
   - Nếu user đã được phép xem một bảng giá trong `price_lists`, thì user cũng được xem tất cả sản phẩm thuộc `price_list_id` đó.
   - Admin/accountant vẫn xem được toàn bộ.
   - Manager vẫn quản lý/sửa/xóa theo quyền hiện có, nhưng quyền xem sẽ không bị giới hạn sai bởi `products.manager_id` khi sản phẩm thuộc cùng bảng giá.

3. **Giữ chống nhân đôi bằng truy vấn đúng `price_list_id`**
   - Trang ProductManagement đã lọc sản phẩm theo `selectedPriceList`; sau khi RLS được sửa theo bảng giá, bảng “Từ 01/5 Năm 2025 Đến Nay” sẽ trả đúng 920 dòng thuộc đúng bảng giá đó, không cộng từ bảng giá khác.

4. **Sửa fallback PGRST103 nếu cần**
   - Đảm bảo nhánh retry khi page vượt quá tổng số cũng dùng cùng bộ lọc hiện tại, để không còn lệch count khi search/category/stock filter.

5. **Kiểm tra lại bằng SQL và preview**
   - Kiểm tra count bảng giá này trả về 920 theo `price_list_id`.
   - Kiểm tra policy không còn `qual: true` trên `products`.
   - Kiểm tra giao diện thống kê hiển thị tổng 920 và phân trang khoảng 19 trang với 50 sản phẩm/trang.

## Thay đổi dự kiến

- Tạo migration sửa RLS policy `products` cho quyền xem theo `price_lists`.
- Có thể chỉnh nhẹ `src/pages/ProductManagement.tsx` để fallback PGRST103 dùng đầy đủ filter hiện tại.

## Kết quả mong muốn

- Trang **“Từ 01/5 Năm 2025 Đến Nay”** hiển thị đủ **920 sản phẩm**.
- Không còn lỗi **PGRST103** khi đổi filter/trang.
- Không còn tình trạng mở policy quá rộng làm lẫn dữ liệu ngoài bảng giá.