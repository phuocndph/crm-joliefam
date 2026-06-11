## Hiện trạng

Định nghĩa đúng của bạn: **"HĐ chưa phát hành" = HĐ nháp đã được tạo trên S-Invoice nhưng chưa ký số / chưa cấp số phát hành**. Đây là kho dữ liệu **riêng** trên Viettel (bảng draft), KHÔNG nằm trong danh sách HĐ đã phát hành.

Code hiện tại đang quét:
- `getListInvoiceDataControl` → chỉ trả HĐ đã có số/đã phát hành (state=1) + vài dòng state=0 lẫn vào → sai nguồn.
- `getInvoices/{taxCode}` sweep `invoiceStatus 1..30` → endpoint này cũng chỉ truy vấn bảng HĐ đã phát hành, không động tới bảng draft.
- 5 endpoint draft đoán mò (`getInvoiceDrafts`, `getInvoiceDraft`, `getDraftInvoice`, `searchInvoiceByCondition`, `getInvoiceListByCondition`) → tất cả 404/NOT_FOUND vì path không khớp với phiên bản API của tax code này.

Sweep mù không hiệu quả nữa — Viettel có rất nhiều biến thể path tuỳ phiên bản triển khai (`InvoiceUtilsWS`, `InvoiceWS`, `BusinessService/...`, `PublishService/...`), không thể đoán đúng nếu không có request thật.

## Hướng xử lý duy nhất còn lại

Lấy đúng request mà portal Viettel gọi khi bạn mở tab "HĐ chưa phát hành", rồi gắn cố định vào edge function.

### Việc bạn cần làm (1 lần, ~2 phút)

1. Đăng nhập portal Viettel S-Invoice (web).
2. Mở DevTools (F12) → tab **Network** → bật **Preserve log** → filter `Fetch/XHR`.
3. Vào menu **Quản lý hoá đơn → HĐ chưa phát hành** (hoặc tab đang hiển thị danh sách HĐ nháp của bạn).
4. Đợi danh sách load xong. Trong Network tìm request POST trả về list (thường tên có `Draft`, `NotSigned`, `Invoice`, hoặc `getInvoice...`).
5. Click request đó → copy 3 thông tin:
   - **Request URL** đầy đủ (ví dụ `https://api-vinvoice.viettel.vn/services/.../InvoiceWS/getInvoiceListNotSigned/0123456789`)
   - **Request Method** (POST/GET)
   - **Request Payload** (JSON body)
6. Dán cả 3 vào chat cho tôi.

Mẹo: nếu nhiều request, lọc thêm bằng cách gõ `invoice` trong ô filter Network; request đúng sẽ có Response trả về array các HĐ nháp với `invoiceNumber=null` hoặc `state=0`.

### Sau khi có request thật

Tôi sẽ làm gọn `supabase/functions/vinvoice-api/index.ts` action `sync_drafts`:

1. **Xoá toàn bộ sweep 1..30 và 5 endpoint đoán mò** — chỉ giữ đúng endpoint thật bạn gửi.
2. **Gọi đúng path + body** Viettel dùng cho tab "HĐ chưa phát hành", phân trang đầy đủ (rowPerPage=100, pageNum tăng dần đến hết).
3. **Bỏ logic `isDraftRow` mềm dẻo** — vì endpoint đã đúng, mọi dòng trả về đều là draft, lưu thẳng vào bảng `einvoices` với `forceDraft: true`.
4. **Giữ dedupe** theo `transactionUuid → invoiceGuid → invoiceId`.
5. **Toast rõ ràng**: "Đã đồng bộ N HĐ nháp từ Viettel".
6. **Log gọn**: chỉ log `[sync_drafts] endpoint=X rows=N pages=P` để dễ kiểm tra sau này.

### Không thay đổi

- Schema DB.
- Các action khác (`sync_invoices`, `issue_draft`, `delete_draft`, `preview_draft`, v.v.).
- UI dialog đồng bộ.

### Tại sao không tự dò tiếp

Đã thử sweep 35 biến thể (30 status + 5 endpoint draft) → 0 kết quả. Tiếp tục đoán mò chỉ tốn thời gian. 1 request thật từ portal sẽ giải quyết dứt điểm trong 5 phút code.
