Kế hoạch chỉnh lại cập nhật đơn GHN:

1. **Bỏ logic khóa theo trạng thái đang quá chặt**
   - Không còn chia `FULL_EDITABLE / TRANSIT_EDITABLE / DELIVERING_ONLY` để tự loại bỏ địa chỉ, sản phẩm, kích thước, ghi chú.
   - Không chặn cập nhật trước ở frontend theo các trạng thái đang giao, đang lưu kho, đang vận chuyển.
   - Chỉ giữ chặn các trạng thái thật sự kết thúc nếu cần thiết, hoặc để GHN trả lỗi trực tiếp nếu GHN không cho cập nhật.

2. **Payload cập nhật đơn**
   - Luôn gửi các thông tin người nhận, địa chỉ, quận/huyện, phường/xã, cân nặng, kích thước, sản phẩm, ghi chú, lưu ý giao hàng, phí giao lại thất bại.
   - **Không gửi `insurance_value` trong `update_order` nữa** vì đây là “giá trị đơn hàng/giá trị hàng hóa” đang gây lỗi GHN không cho sửa.

3. **COD vẫn sửa được**
   - Giữ COD cập nhật qua API riêng `update_cod`.
   - Bỏ danh sách trạng thái hạn chế COD ở frontend; nếu người dùng đổi COD thì gọi `update_cod` và để GHN phản hồi chính xác.

4. **UI trong popup sửa GHN**
   - Trường “Tổng giá trị hàng hóa” sẽ chuyển sang chỉ đọc/khóa, ghi rõ đây là giá trị đơn hàng không cập nhật được sau khi tạo đơn.
   - Banner cảnh báo sẽ đổi nội dung: “Có thể sửa thông tin đơn, địa chỉ, COD; riêng giá trị hàng hóa không thể đổi trên GHN.”

5. **Edge function**
   - Không cần đổi endpoint lớn; chỉ đảm bảo lỗi GHN vẫn được hiển thị rõ nếu GHN từ chối field nào khác.