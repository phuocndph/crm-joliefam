Tôi kiểm tra lại rồi: API Viettel đã trả về 57 hóa đơn, nhưng DB vẫn 0 dòng vì bảng `einvoices` đang có 2 trigger `set_manager_id` chạy trước khi insert. Edge Function dùng service role nhưng trigger vẫn gọi `auth.uid()`, mà trong Edge Function service role không có user context nên trigger ném lỗi: “Authentication required. Please log in to create records.”

Kế hoạch sửa dứt điểm:

1. Sửa cấu trúc DB cho `einvoices`
   - Gỡ 2 trigger tự set `manager_id` trên bảng `einvoices`:
     - `set_einvoices_manager_id`
     - `set_manager_id_einvoices`
   - Giữ nguyên RLS/policy hiện tại.
   - Lý do: Edge Function đã tự xác định `manager_id` từ user đang đăng nhập và ghi trực tiếp vào record, không cần trigger này nữa.

2. Làm sạch constraint/index trùng nếu cần
   - Hiện đang có cả unique constraint `einvoices_transaction_uuid_key` và partial unique index `einvoices_transaction_uuid_uniq` trên `transaction_uuid`.
   - Giữ lại constraint dùng cho `upsert(... onConflict: "transaction_uuid")`.
   - Không đụng dữ liệu cũ.

3. Chỉnh lại Edge Function để sync ổn định hơn
   - Dùng service-role client cho toàn bộ phần ghi `einvoices`.
   - Batch upsert theo danh sách hóa đơn thay vì insert từng dòng để dễ bắt lỗi và nhanh hơn.
   - Trả về rõ:
     - API lấy được bao nhiêu hóa đơn.
     - DB ghi được bao nhiêu hóa đơn.
     - Nếu lỗi thì trả nguyên lỗi DB đầu tiên.

4. Test thật sau khi sửa
   - Gọi action `sync_invoices` với range `11/05/2026 - 10/06/2026`.
   - Query lại `public.einvoices` để xác nhận có 57 bản ghi.
   - Kiểm tra log Edge Function không còn lỗi `Authentication required`.

Kết quả kỳ vọng: bấm Đồng bộ hóa đơn sẽ thấy `total: 57`, `synced: 57`, và bảng hóa đơn trong app hiển thị dữ liệu.