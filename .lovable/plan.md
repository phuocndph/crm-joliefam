Nguyên nhân gốc rễ nằm ở payload cập nhật đơn GHN, không phải do nút hay form.

Hiện tại mỗi lần bấm “CẬP NHẬT ĐƠN”, frontend luôn gọi `update_order` và gửi cả các trường GHN không cho sửa ở trạng thái `delivering`, đặc biệt là:

```text
content
items
```

Log Edge Function đã xác nhận GHN trả lỗi:

```text
Not support change field: content with order status: delivering
```

Vì `content` luôn được gửi trong mọi lần cập nhật, nên dù anh chỉ đổi địa chỉ, COD, ghi chú, hay bất kỳ nội dung nhỏ nào, GHN vẫn thấy request có trường `content` và từ chối toàn bộ request. Toast ngoài frontend lại chỉ hiện chung chung `Edge Function returned a non-2xx status code`, nên nhìn như “cái gì cũng không cập nhật được”.

Kế hoạch sửa:

1. Sửa `EditGHNOrderDialog.tsx`
   - Không gửi `content` trong `update_order` nữa.
   - Không gửi `insurance_value` vì đó là giá trị đơn hàng/bảo hiểm không sửa được.
   - Với đơn đang `delivering`, không gửi `items` nếu người dùng không thực sự cần sửa sản phẩm, vì GHN có thể cũng khóa nhóm hàng hóa theo trạng thái.
   - Vẫn cho gửi các trường cần sửa: người nhận, điện thoại, địa chỉ, quận/huyện, phường/xã, khối lượng/kích thước, ghi chú, yêu cầu giao hàng, phí giao thất bại.

2. Giữ COD đi qua endpoint riêng
   - COD vẫn cập nhật bằng `update_cod`, không phụ thuộc payload `update_order`.
   - Nếu chỉ đổi COD, có thể bỏ qua `update_order` khi các field đơn hàng khác không đổi để tránh bị GHN chặn không cần thiết.

3. Cải thiện thông báo lỗi thật từ Edge Function
   - Khi Edge Function trả non-2xx, frontend sẽ đọc nội dung lỗi thật từ response thay vì chỉ hiện `Edge Function returned a non-2xx status code`.
   - Như vậy nếu GHN khóa trường nào khác, màn hình sẽ hiện đúng tên trường bị khóa.

4. Kiểm tra lại sau sửa
   - Bấm cập nhật khi đổi địa chỉ/ghi chú/COD sẽ không còn bị chặn bởi lỗi `content`.
   - Nếu GHN tiếp tục khóa một trường khác theo trạng thái đơn, lỗi hiển thị sẽ chỉ rõ trường đó để xử lý tiếp.