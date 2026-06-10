## Kết luận nhanh

Tab “Chưa phát hành / HĐ nháp” không có dữ liệu vì hàm đồng bộ nháp đang gọi API Viettel `getListInvoiceDataControl`, endpoint này trả về 57 hóa đơn nhưng tất cả đều có `state=1` (đã phát hành), không có bản nào `state=3` (nháp). Hiện code fallback sang endpoint có `invoiceStatus=3` chỉ chạy khi endpoint đầu lỗi, nên trường hợp endpoint đầu thành công nhưng không có nháp thì không thử endpoint chuyên biệt.

## Kế hoạch sửa

1. Cập nhật `supabase/functions/vinvoice-api/index.ts`
   - Trong action `sync_drafts`, sau khi gọi `getListInvoiceDataControl`, nếu lọc ra 0 hóa đơn nháp thì gọi tiếp endpoint `getInvoices/{taxCode}` với `invoiceStatus: 3`.
   - Ghi log/response rõ ràng: tổng hóa đơn trả về, số bản nháp lọc được, endpoint đã dùng.
   - Giữ nguyên phần upsert vào bảng `einvoices` và gán `status='draft'`, `is_draft=true`.

2. Cập nhật UI thông báo ở `src/hooks/useEInvoices.ts`
   - Khi đồng bộ nháp mà Viettel trả về hóa đơn nhưng không có nháp, toast sẽ nói rõ “Không có HĐ nháp trên Viettel trong khoảng ngày này”, thay vì nhìn như lỗi không lấy được dữ liệu.
   - Nếu endpoint chuyên biệt lấy được nháp thì hiển thị số bản ghi đã đồng bộ như hiện tại.

3. Triển khai và kiểm tra
   - Deploy lại edge function `vinvoice-api`.
   - Gọi thử action `sync_drafts` với khoảng 30 ngày đang dùng để xác nhận response có fallback và không lỗi.
   - Nếu Viettel thật sự không có HĐ nháp trong khoảng ngày đó, UI sẽ hiển thị đúng lý do thay vì bảng trống khó hiểu.

## Không cần đổi database

Bảng `einvoices` đã có `is_draft`, `draft_payload`, `transaction_uuid`; RLS cũng đang cho manager hiện tại đọc dữ liệu đúng `manager_id`. Không cần migration.