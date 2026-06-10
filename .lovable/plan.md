# Đồng bộ 2 chiều & quản lý đầy đủ HĐ Viettel S-Invoice

## Vấn đề hiện tại
- `get_templates` trả `totalRows: 0` → backend gọi sai endpoint hoặc thiếu tham số. Test login OK, MST `0108652480` đúng → cần sửa endpoint/payload mẫu HĐ.
- Tab "Lịch sử nội bộ" chỉ hiển thị HĐ tạo từ app, không thấy HĐ đã có trên S-Invoice → cần action đồng bộ kéo về.
- Chưa có thao tác: tải PDF/XML, huỷ, thay thế, điều chỉnh, gửi email, cập nhật thanh toán.

## 1. Sửa & mở rộng edge function `vinvoice-api`

**Sửa `get_templates`**: dùng đúng endpoint `getAllInvoiceTemplates/{taxCode}` (GET, không body) thay vì `getInvoiceTemplates` (POST cần invoiceType).

**Thêm 8 action mới**, mỗi action: Zod validate → `getVinvoiceToken()` (cache 50') → fetch Viettel → log raw → upsert `einvoices` → ghi `einvoice_actions` (audit) → trả nguyên văn lỗi.

| Action | Endpoint Viettel | Mục đích |
|---|---|---|
| `sync_invoices` | `InvoiceUtilsWS/getInvoices/{MST}` (POST, body: `fromDate`/`toDate` UTC+7 millis) | Kéo danh sách HĐ về DB |
| `download_file` | `InvoiceUtilsWS/getInvoiceRepresentationFile` | Tải PDF/XML → upload Storage `einvoices/{id}.pdf` → trả URL ký |
| `cancel_invoice` | `InvoiceWS/cancelTransactionInvoice/{MST}` | Huỷ HĐ + lý do |
| `replace_invoice` | `InvoiceWS/createInvoice/{MST}` (`adjustmentType=5`, `originalInvoiceId`) | Thay thế |
| `adjust_invoice` | `InvoiceWS/createInvoice/{MST}` (`adjustmentType=2`) | Điều chỉnh |
| `send_email` | `InvoiceUtilsWS/sendHtmlMailProcess` | Gửi HĐ qua mail |
| `update_payment` | `InvoiceWS/updatePaymentStatus` | Đồng bộ thanh toán lên Viettel |
| `search_by_uuid` | `InvoiceWS/searchInvoiceByTransactionUuid` | Tra cứu 1 HĐ chi tiết |

## 2. Database migration

Thêm cột vào `einvoices`:
- `pdf_url text`, `xml_url text` — link Storage sau khi tải
- `cancelled_at timestamptz`, `cancel_reason text`
- `original_invoice_id uuid` (self-FK) — HĐ gốc cho thay thế/điều chỉnh
- `invoice_action text` — `original | replacement | adjustment`
- `payment_status_synced boolean default false`
- `reservation_code text`, `last_synced_at timestamptz`
- `email_sent_at timestamptz`, `email_sent_to text`
- Unique index `(transaction_uuid)` để upsert sync

Bảng mới `einvoice_actions` (audit log): `id, einvoice_id, action, request jsonb, response jsonb, status, error_message, created_by, manager_id, created_at` + RLS theo manager.

Storage bucket private `einvoices` + RLS đọc theo manager.

## 3. UI — tab "Lịch sử nội bộ" → đổi tên "Hoá đơn S-Invoice"

**Toolbar mới**:
- Filter: trạng thái, khoảng ngày phát hành, MST khách, số HĐ
- Nút **"Đồng bộ từ Viettel"** → dialog chọn khoảng ngày (mặc định 30 ngày gần nhất) → gọi `sync_invoices` → upsert vào DB → toast "Đã đồng bộ X HĐ"
- Stats: thêm `Đã huỷ`, `Đã thay thế`, `Đã điều chỉnh`

**Mỗi dòng — dropdown "Thao tác" theo trạng thái**:
- `draft` → Xem trước, Phát hành, Sửa, Xoá
- `issued` → Tải PDF, Tải XML, Gửi email, Cập nhật thanh toán, **Huỷ**, **Thay thế**, **Điều chỉnh**
- `cancelled` → Tải PDF lưu trữ, **Thay thế**
- `replaced/adjusted` → Tải PDF, xem HĐ thay thế/điều chỉnh

**Cột mới**: "Loại" (gốc/thay thế/điều chỉnh), "Email", "TT thanh toán" (đã sync lên Viettel chưa).

## 4. Dialog mới

- `CancelInvoiceDialog`: textarea lý do, confirm → `cancel_invoice`
- `ReplaceInvoiceDialog`: copy items từ HĐ gốc, sửa được, lý do thay thế → `replace_invoice`
- `AdjustInvoiceDialog`: chọn loại điều chỉnh (tăng/giảm), nhập items điều chỉnh, lý do → `adjust_invoice`
- `SendEmailDialog`: input email (mặc định từ HĐ), gửi
- `SyncInvoicesDialog`: 2 date picker, nút "Đồng bộ"

## 5. Hook React Query `useEInvoices.ts` mở rộng
- `useEInvoiceActions()` — mutations cho 8 action mới, invalidate `einvoices` sau mỗi action
- `useSyncEInvoices()` — sync theo khoảng ngày

## 6. Phân quyền
- `sync_invoices`, `download_file`, `send_email`, `update_payment`: admin/manager/accountant
- `cancel/replace/adjust`: chỉ admin/manager
- Edge function verify JWT + check role server-side

## 7. Tab Cấu hình
- Giữ nguyên 4 card hiện có
- Sửa lại Card 3 "Test lấy mẫu HĐ" để dùng endpoint mới (sẽ hết lỗi `totalRows: 0`)

## Kỹ thuật cốt lõi (theo tài liệu Viettel)
- `transactionUuid`: client-generated UUID v4 (chống trùng)
- `originalInvoiceIssueDate`: **unix timestamp millis** khi thay thế/điều chỉnh
- `adjustmentType`: `1`=mới, `5`=thay thế, `2`=điều chỉnh
- Sync date range: gửi `fromDate/toDate` dạng `YYYYMMDDHHmmss` UTC+7
- File response: base64 → `Uint8Array` → upload Storage → tạo signed URL 7 ngày
- Cache token 50' trong memory edge

## Trình tự thực hiện
1. Migration (cột mới + bảng audit + bucket)
2. Sửa `get_templates` + thêm 8 action → deploy & test
3. Hook + dialog + UI
4. Test đầu cuối: sync → tải PDF → huỷ → thay thế

## Lưu ý
- Sau khi bạn duyệt, mình chạy migration trước (bạn approve), sau đó viết code.
- Nếu Viettel trả lỗi không lường trước, toast sẽ hiện nguyên văn message để debug.
