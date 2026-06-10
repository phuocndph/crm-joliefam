Kết quả kiểm tra hiện tại:
- Cấu hình Viettel đang đúng: API URL `https://api-vinvoice.viettel.vn`, MST `0108652480`, login thành công.
- API Viettel đã đọc được dữ liệu: `getListInvoiceDataControl` trả `200` và có `57` hóa đơn trong khoảng `11/05/2026 - 10/06/2026`.
- Lỗi chính không nằm ở API đọc, mà ở bước lưu DB: log báo `there is no unique or exclusion constraint matching the ON CONFLICT specification` khi upsert vào `einvoices` theo `transaction_uuid`.
- Bảng `einvoices` hiện không có unique constraint/index cho `transaction_uuid`, nên `upsert(... onConflict: "transaction_uuid")` luôn fail. Vì vậy API đọc được 57 hóa đơn nhưng DB vẫn 0 bản ghi.

Kế hoạch làm lại toàn bộ phần đọc/đồng bộ S-Invoice:

1. Sửa cấu trúc DB để đồng bộ được
- Thêm ràng buộc duy nhất cho `einvoices.transaction_uuid` để upsert hoạt động đúng.
- Giữ nhiều bản ghi local draft chưa có `transaction_uuid` vì unique trong Postgres vẫn cho phép nhiều giá trị null.
- Không tạo bảng mới, không thay đổi dữ liệu hóa đơn hiện có.

2. Viết lại luồng sync theo hướng chắc chắn hơn
- Dùng endpoint chính đã chứng minh đọc được dữ liệu:
  - `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getListInvoiceDataControl`
  - Body: `{ supplierTaxCode, fromDate, toDate }`
  - Ngày dạng `DD/MM/YYYY`
- Chỉ dùng `getInvoices/{taxCode}` làm endpoint thăm dò/fallback, không coi nó là nguồn chính vì đang trả `NOT_FOUND_DATA`.
- Khi Viettel trả `57` hóa đơn, map và lưu toàn bộ, trả rõ `synced`, `total`, và danh sách lỗi nếu có.

3. Chuẩn hóa mapper dữ liệu Viettel
- Map đúng các field thực tế đang thấy từ Viettel:
  - `invoiceId`, `invoiceType`, `templateCode`, `invoiceSeri`, `invoiceNumber`, `invoiceNo`
  - `total`, `totalBeforeTax`, `taxAmount`, `issueDate`
  - `buyerLegalName`, `buyerName`, `buyerTaxCode`
- Nếu `transactionUuid` null, tạo mã ổn định theo `vt-{taxCode}-{invoiceId}` để không bị trùng khi đồng bộ lại.
- Lưu raw response vào `response_data` để về sau đối soát/tải file.

4. Sửa quyền ghi trong Edge Function
- Edge Function tiếp tục xác thực JWT người dùng.
- Tự xác định `manager_id` từ vai trò user, không nhận `manager_id` từ frontend.
- Dùng service client cho thao tác ghi đồng bộ vào `einvoices` để tránh RLS chặn nhầm nhân viên/kế toán, nhưng vẫn giới hạn quyền trong code.
- Chỉ cho admin/manager chạy sync và chẩn đoán đọc dữ liệu.

5. Làm lại diagnostic để dễ kiểm tra
- Diagnostic hiển thị rõ:
  - Login OK/Fail
  - Endpoint nào trả dữ liệu
  - Số bản ghi Viettel trả về
  - Số bản ghi lưu DB thành công
  - Lỗi DB cụ thể nếu có
- Không log/lộ password hoặc token đầy đủ.

6. Sửa các API phụ đang có nguy cơ sai
- `get_templates`: giữ `POST /getInvoiceTemplates` với `{ taxCode, invoiceType }`, fallback endpoint cũ nếu cần.
- `search_by_uuid`: đổi sang format phù hợp hơn nếu Viettel yêu cầu form-url-encoded.
- Tải PDF/XML: ưu tiên `transactionUuid`; nếu bản ghi chỉ có mã tổng hợp `vt-*`, cần dùng dữ liệu gốc trong `response_data` như `invoiceNo/templateCode` để fallback.

7. Kiểm thử sau khi sửa
- Chạy lại diagnostic với khoảng `11/05/2026 - 10/06/2026`.
- Chạy sync invoices.
- Kiểm tra DB `einvoices` phải có khoảng `57` bản ghi.
- Kiểm tra log không còn lỗi `ON CONFLICT`.

Technical notes:
- Migration cần thêm: `ALTER TABLE public.einvoices ADD CONSTRAINT einvoices_transaction_uuid_key UNIQUE (transaction_uuid);`
- Code sync nên đổi từ `supabase.from("einvoices").upsert(...)` sang `supabaseService.from("einvoices").upsert(...)` sau khi đã xác thực user và manager_id.
- Upsert tiếp tục dùng `onConflict: "transaction_uuid"` sau khi constraint tồn tại.