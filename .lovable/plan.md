## Kế hoạch rà và sửa luồng đồng bộ hóa đơn S-Invoice

### Mục tiêu
- Đi từ đầu luồng `Đồng bộ nháp từ Viettel` / `Đồng bộ từ Viettel`.
- Không để trường hợp Viettel trả `NOT_FOUND_DATA` làm app báo lỗi đỏ `Không tìm thấy bản ghi`.
- Đảm bảo nếu Viettel có dữ liệu thì parse đúng danh sách và lưu vào bảng `einvoices`.

### Phát hiện hiện tại
- UI gọi đúng Edge Function qua `useEInvoiceActions`.
- Edge Function hiện đã gửi đúng `startDate/endDate` dạng ISO `2026-05-11T00:00:00.000+07:00` → lỗi “ngày kết thúc là bắt buộc” đã hết.
- Viettel đang trả:
  - `message: NOT_FOUND_DATA`
  - `data: Không tìm thấy bản ghi`
- DB `einvoices` hiện có `0` bản ghi, nên không phải lỗi RLS che dữ liệu hiện có.
- App đang biến `NOT_FOUND_DATA` thành lỗi toast, trong khi đây nên được hiểu là “đồng bộ thành công nhưng không có hóa đơn trong khoảng ngày/loại HĐ đã chọn”.

### Việc sẽ sửa
1. **Chuẩn hóa xử lý response Viettel trong `vinvoice-api`**
   - Thêm helper nhận diện `NOT_FOUND_DATA` / “Không tìm thấy bản ghi”.
   - Với `sync_invoices` và `sync_drafts`, nếu gặp mã này thì trả về:
     - `success: true`
     - `synced: 0`
     - `total: 0`
     - thông báo rõ là không có dữ liệu trong khoảng đã chọn.

2. **Log request đầy đủ hơn cho sync nháp**
   - Hiện `sync_drafts` log action chưa lưu `request`, gây khó debug.
   - Bổ sung lưu `request: reqBody` giống `sync_invoices`.

3. **Tăng độ bền parser danh sách hóa đơn**
   - Mở rộng nơi đọc list từ Viettel: `invoices`, `lstInvoice`, `data`, `data.invoices`, `data.lstInvoice`, `result.invoices`, `result.lstInvoice`, v.v.
   - Dùng chung helper parse list cho cả nháp và đã phát hành để tránh lệch logic.

4. **Điều chỉnh toast phía frontend**
   - Nếu `synced=0,total=0`, hiển thị thông báo nhẹ: “Không có hóa đơn trong khoảng ngày đã chọn” thay vì báo lỗi.
   - Nếu có dữ liệu, vẫn hiển thị số lượng đồng bộ như hiện tại.

5. **Kiểm tra lại RLS/DB sau khi sửa**
   - Giữ chính sách RLS hiện tại nếu không có vấn đề, vì bảng đang thật sự trống.
   - Không mở public hoặc nới quyền không cần thiết.

### Kết quả mong đợi
- Bấm đồng bộ khi Viettel không có hóa đơn: app không báo lỗi đỏ, mà báo không có dữ liệu.
- Khi Viettel trả danh sách hóa đơn: app lưu được vào `einvoices` và hiển thị ở tab tương ứng.
- Nhật ký `einvoice_actions` đủ request/response để lần sau debug nhanh hơn.