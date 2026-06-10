Đã đối chiếu tài liệu và code nguồn tham khảo Viettel S-Invoice.

Kết luận sai lệch chính
- Code hiện tại đang ưu tiên endpoint `getInvoices/{taxCode}` với body `startDate/endDate` dạng ISO. Tài liệu/code tham khảo dùng endpoint đọc theo khoảng ngày là:
  - `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getListInvoiceDataControl`
  - body JSON: `{ supplierTaxCode, fromDate, toDate }`
  - ngày dạng `DD/MM/YYYY`
- Code lấy mẫu hiện đang gọi sai endpoint:
  - hiện tại: `GET /getAllInvoiceTemplates/{taxCode}` → log trả `404 Not Found`
  - tài liệu/code tham khảo dùng: `POST /getInvoiceTemplates` với body `{ taxCode, invoiceType }`
- Một số API tra cứu/tải file trong tài liệu dùng `Authorization: Bearer token`; code hiện gửi cả `Authorization` và `Cookie`, không phải nguyên nhân chính nhưng nên chuẩn hóa theo tài liệu.
- `getListInvoiceDataControl` là luồng đúng hơn để lấy hoá đơn đã phát hành theo ngày. `getInvoices/{taxCode}` có thể là API khác/tenant khác, nên đang trả `NOT_FOUND_DATA` dù login OK.

Nguồn đối chiếu
- Repository tham khảo `dev10katec/viettel-s-invoice`: `getInvoicesByDateRange()` gọi `getListInvoiceDataControl` với `supplierTaxCode/fromDate/toDate` dạng `DD/MM/YYYY`.
- Cùng repository: `getInvoiceTemplates()` gọi `POST /getInvoiceTemplates` với `{ taxCode, invoiceType }`.
- Trang hướng dẫn Viettel Postman xác nhận các API S-Invoice dùng REST JSON và luồng phát hành/tra cứu/tải file theo `InvoiceAPI/InvoiceUtilsWS`.

Kế hoạch sửa
1. Sửa lấy danh sách hoá đơn phát hành
   - Đổi `sync_invoices` ưu tiên dùng `getListInvoiceDataControl`.
   - Gửi body đúng tài liệu: `supplierTaxCode`, `fromDate`, `toDate` dạng `DD/MM/YYYY`.
   - Không gửi `invoiceStatus: null` ở request chính.
   - Giữ `getInvoices/{taxCode}` chỉ làm fallback/phụ để dò tenant nếu cần.

2. Sửa lấy mẫu hoá đơn
   - Đổi `get_templates` sang `POST /getInvoiceTemplates`.
   - Gửi `{ taxCode: MST, invoiceType }`.
   - Frontend dùng invoice type đang chọn hoặc mặc định `01GTKT`.

3. Chuẩn hóa parser dữ liệu trả về
   - Parse các dạng list thường gặp: mảng trực tiếp, `data`, `result`, `lstInvoice`, `lstInvoiceData`, `content`, `rows`, `items`.
   - Map thêm các field phổ biến: `transactionUuid`, `transactionID`, `invoiceNo`, `invoiceNumber`, `templateCode`, `invoiceSeries`, `buyerLegalName`, `buyerName`, `totalAmountWithTax`.

4. Thêm action chẩn đoán API đọc dữ liệu
   - Action chỉ admin/manager dùng để gọi thử:
     - login
     - `getInvoiceTemplates`
     - `getListInvoiceDataControl`
     - fallback `getInvoices/{taxCode}`
   - Trả về status, message, số bản ghi đọc được, response keys; không lộ token/password.

5. Cập nhật UI cấu hình
   - Nút “Kiểm tra đọc dữ liệu Viettel”.
   - Hiển thị endpoint nào trả dữ liệu, endpoint nào lỗi, và số bản ghi đọc được.

6. Kiểm thử sau sửa
   - Deploy `vinvoice-api`.
   - Chạy chẩn đoán trên tài khoản hiện tại.
   - Chạy đồng bộ lại.
   - Kiểm tra bảng `einvoices` có bản ghi nếu Viettel trả dữ liệu; nếu Viettel vẫn trả rỗng, UI báo rõ API login OK nhưng không có hoá đơn trong ngày/loại HĐ đã chọn.