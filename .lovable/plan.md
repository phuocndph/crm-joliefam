## Vấn đề hiện tại

Log mới nhất xác nhận:
- `getListInvoiceDataControl` trả 206 dòng nhưng 204 là `state=1` (đã phát hành) + 2 là `state=0`. Endpoint này là "data control" của HĐ đã có trên hệ thống — không phải nguồn của tab "HĐ chưa phát hành" trên portal Viettel.
- `getInvoices?invoiceStatus=0|3|8|20` đều trả `400 NOT_FOUND_DATA` → các mã trạng thái này không phải mã Viettel của bạn đang dùng cho draft.

Vì vậy app chỉ vớt được 1 dòng draft "vô tình" lẫn trong danh sách đã phát hành, đúng như bạn thấy.

## Hướng xử lý

Quét rộng để tìm đúng endpoint + mã trạng thái mà Viettel của tax code này thực sự dùng cho draft, log chi tiết để chốt endpoint chuẩn sau 1 lần đồng bộ.

## Việc cần làm trong `supabase/functions/vinvoice-api/index.ts` (action `sync_drafts`)

1. Thêm bộ endpoint ứng viên cho draft, gọi tuần tự, dòng nào ra data thì gộp vào `merged`:
   - `InvoiceUtilsWS/getInvoiceDrafts/{taxCode}` (POST, body `{ invoiceType, startDate, endDate, rowPerPage, pageNum }`)
   - `InvoiceUtilsWS/searchInvoiceByCondition/{taxCode}` (POST, body có `invoiceType, startDate, endDate, invoiceStatus`)
   - `InvoiceWS/getDraftInvoice/{taxCode}` (POST)
   - `InvoiceUtilsWS/getInvoiceDraft/{taxCode}` (POST)
   - `BusinessService/InvoiceUtilsWS/getInvoiceListByCondition` (POST)
2. Mở rộng sweep `invoiceStatus` trên endpoint `getInvoices/{taxCode}` từ tập `{0,3,8,20}` → sweep `1..30`. Endpoint nào trả 200 + có dòng thì log lại "invoiceStatus=N có X dòng" để bạn biết mã thật là gì.
3. Với mỗi endpoint thử: log `status`, `total`, `drafts`, và `sample` (1 dòng đầu) vào `attempts` (đã có sẵn cơ chế).
4. Phân loại draft mềm hơn: bất kỳ dòng nào tới từ endpoint có chữ "Draft" trong path hoặc từ `getInvoices?invoiceStatus=N` với `N` mà ta đang sweep, đều coi là draft (vì chính filter của Viettel đã lọc). Chỉ dùng `isDraftRow` để hậu kiểm cho `getListInvoiceDataControl`.
5. Dedupe theo `transactionUuid → invoiceGuid → invoiceId → (templateCode+invoiceSeri+invoiceNumber)`.
6. Tăng giới hạn phân trang lên 100 trang, mỗi trang 100 dòng (đã có 50, tăng nhẹ).
7. Trả về `attempts` đầy đủ + message tổng kết: "Đã thử N endpoint, endpoint X trả Y draft, đã lưu Z". Hiển thị qua toast (`useEInvoices.ts` đã log `attempts` rồi, chỉ cần đảm bảo message rõ).

## Sau khi chạy

Bạn bấm "Đồng bộ HĐ chưa phát hành" 1 lần với khoảng ngày đang có draft trên portal. Mở Console, gửi tôi log `[sync_drafts] attempts:` — sẽ thấy ngay endpoint/mã trạng thái nào có dữ liệu để chốt lại logic gọn gàng (loại bỏ những endpoint vô dụng).

## Không thay đổi

- Không sửa schema DB.
- Không đụng các action khác (`sync_invoices`, `issue_draft`, v.v.).
- Không sửa UI ngoài việc message toast tự động phong phú hơn nhờ `d.message`.
