Mình thấy nguyên nhân có khả năng cao là app đang chỉ gọi `getInvoices` với `invoiceStatus=3`, nhưng danh sách HĐ chưa phát hành trên Viettel có thể không dùng mã trạng thái này hoặc cần đồng bộ qua endpoint/dạng payload khác. Vì vậy app đang báo “không có” dù trên Viettel có dữ liệu.

Kế hoạch sửa:

1. Mở rộng đồng bộ HĐ chưa phát hành
   - Không chỉ thử `invoiceStatus=3`.
   - Thử thêm các mã trạng thái phổ biến cho HĐ nháp/chưa phát hành trên Viettel như `0`, `1`, `2`, `3`, tùy schema thực tế trả về.
   - Nếu endpoint trả dữ liệu nhưng trạng thái không rõ, ghi log mẫu field trạng thái để xác định đúng mã Viettel đang dùng.

2. Không ghi đè kết quả “có thể có dữ liệu” thành “không có” quá sớm
   - Hiện fallback `NOT_FOUND_DATA` làm app kết luận không có HĐ nháp.
   - Sửa để chỉ báo “không có” sau khi đã thử đủ các biến thể truy vấn.

3. Tăng khả năng nhận diện HĐ chưa phát hành
   - Đọc thêm các field trạng thái từ Viettel: `state`, `stateCode`, `invoiceStatus`, `status`, `publishStatus`, `paymentStatus`, `invoiceStatusName`, `stateName`, `statusName`, `description`.
   - Chỉ lưu vào tab “Chưa phát hành” khi xác định là nháp/chưa phát hành hoặc dữ liệu đến từ endpoint truy vấn riêng cho HĐ chưa phát hành.

4. Cập nhật thông báo trả về
   - Nếu tìm thấy: báo rõ đã đồng bộ bao nhiêu HĐ và endpoint/status nào trả dữ liệu.
   - Nếu không tìm thấy: báo đã thử những trạng thái nào, thay vì chỉ nói chung “không có hoá đơn”.

5. Kiểm tra lại bằng log Edge Function
   - Sau khi sửa, chạy lại luồng đồng bộ để xem Viettel trả dữ liệu ở trạng thái nào và đảm bảo dữ liệu được lưu vào `einvoices` với `is_draft=true`, `status='draft'`.