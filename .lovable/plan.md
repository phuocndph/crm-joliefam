Kế hoạch sửa phần lấy số lượng HĐ chưa phát hành bị thiếu:

1. Sửa logic phân loại HĐ chưa phát hành
- Không chỉ dựa vào vài mã trạng thái cứng `0, 3, 8, 20`.
- Bổ sung nhận diện theo nhiều dấu hiệu từ Viettel: `state/stateCode/invoiceStatus/status`, tên trạng thái, `issueDate`, `issueDateStr`, `invoiceNumber`, `invoiceNo`, các trường publish/sign/publishStatus nếu có.
- Tránh đánh nhầm HĐ đã phát hành thành nháp bằng cách ưu tiên dấu hiệu đã phát hành như có `issueDate` hợp lệ và số hóa đơn thật.

2. Không bỏ sót do phân trang / giới hạn dòng
- Với endpoint `getInvoices`, lặp qua nhiều trang thay vì chỉ gọi `pageNum: 1`.
- Dừng khi hết dữ liệu hoặc đã đạt `totalRows` Viettel trả về.
- Tăng thống kê trả về: tổng Viettel báo, tổng app đã đọc, tổng đã phân loại nháp, tổng đã lưu.

3. Thêm thống kê chẩn đoán trạng thái Viettel
- Trong `sync_drafts`, trả về và log phân bố trạng thái thực tế: mỗi `state/stateCode/invoiceStatus/status` có bao nhiêu dòng.
- Toast sau đồng bộ sẽ hiển thị rõ: “Viettel trả X dòng, app đọc Y dòng, nhận diện Z HĐ chưa phát hành, đã lưu N”.

4. Giữ đồng bộ đúng với app hiện tại
- Vẫn lưu vào bảng `einvoices` bằng `transaction_uuid` ổn định.
- Vẫn gắn `is_draft=true`, `status='draft'` chỉ cho các dòng được xác định là chưa phát hành.
- Không thay đổi cấu trúc database.

5. Kiểm tra sau sửa
- Chạy lại đồng bộ HĐ chưa phát hành với khoảng ngày rộng.
- Đối chiếu log: hiện tại backend đã đọc 413 dòng nhưng chỉ nhận diện 5 nháp; sau sửa sẽ thấy rõ các trạng thái nào bị bỏ sót và số đã lưu.