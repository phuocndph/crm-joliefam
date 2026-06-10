Kết quả kiểm tra hiện tại:

- Luồng “Chưa phát hành / Đồng bộ nháp từ Viettel” đang gọi đúng Edge Function `vinvoice-api` với action `sync_drafts`.
- API Viettel trả về:
  - `getListInvoiceDataControl`: có dữ liệu hoá đơn, nhưng toàn bộ là hoá đơn đã phát hành (`state=1`), không có bản ghi nháp/chưa phát hành (`state=3`).
  - Fallback `getInvoices` với `invoiceStatus=3`: Viettel trả `400 NOT_FOUND_DATA` / “Không tìm thấy bản ghi”.
- Database hiện chỉ có `57` hoá đơn `issued`, `0` hoá đơn `draft`.

Kết luận: hiện tại không phải lỗi mất dữ liệu trong app; Viettel đang báo không có HĐ nháp/chưa phát hành trong khoảng ngày và loại HĐ đang chọn (`01GTKT`).

Kế hoạch sửa để tránh hiểu nhầm và hỗ trợ kiểm tra tiếp:

1. Cập nhật thông báo đồng bộ
   - Khi Viettel trả `NOT_FOUND_DATA` cho `invoiceStatus=3`, hiển thị rõ: “Viettel không có HĐ chưa phát hành trong khoảng ngày/loại HĐ này”.
   - Không báo lỗi chung chung như không lấy được dữ liệu.

2. Bổ sung thông tin chẩn đoán trong UI
   - Hiển thị số HĐ Viettel trả về từ endpoint chính.
   - Hiển thị số HĐ được nhận diện là chưa phát hành.
   - Hiển thị endpoint đã dùng để kiểm tra.

3. Cải thiện bộ lọc trạng thái nháp
   - Kiểm tra thêm các trường có thể biểu thị trạng thái chưa phát hành như `state`, `stateCode`, `invoiceStatus`, `status`, `invoiceStatusName` nếu Viettel trả schema khác.
   - Vẫn giữ logic an toàn: chỉ lưu vào tab chưa phát hành khi xác định chắc là nháp/chưa phát hành.

4. Sau khi sửa
   - Test lại action `sync_drafts` với khoảng 30 ngày và 3 tháng.
   - Đối chiếu log Viettel + bảng `einvoice_actions` để xác nhận thông báo trả về đúng nguyên nhân.