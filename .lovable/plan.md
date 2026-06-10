
# Sửa lỗi đồng bộ HĐ — `START_DATE_REQUIRED`

## Nguyên nhân
Viettel `InvoiceUtilsWS/getInvoices/{MST}` yêu cầu `fromDate` / `toDate` là **chuỗi `dd/MM/yyyy`** (theo SDK chính thức `dev10katec/viettel-s-invoice` và tài liệu Viettel), không phải epoch millis. App đang gửi `Number` → Viettel parse thành null → trả `START_DATE_REQUIRED`.

## Fix

### 1. Edge function `vinvoice-api` — action `sync_invoices`
- Nhận `fromDate` / `toDate` từ client ở dạng ms epoch như cũ (không đổi API frontend).
- Convert sang `dd/MM/yyyy` trước khi gửi Viettel.
- Body mới gửi Viettel:
  ```ts
  {
    invoiceType: "01GTKT",
    fromDate: "11/05/2026",     // dd/MM/yyyy
    toDate:   "10/06/2026",
    rowPerPage: 1000,
    pageNum: 1,
  }
  ```
- Nếu Viettel trả 400 với message khác, fallback thử lại body cũ (ms) để tương thích.
- Parse danh sách HĐ từ các key có thể có: `lstInvoice`, `invoices`, `data`, `result.invoices`.
- Log raw response để dễ debug lần sau.

### 2. Frontend (không đổi UI)
- `SyncInvoicesDialog` vẫn truyền ms epoch — edge function tự lo convert.

### 3. Cải thiện thông báo lỗi
- Khi Viettel trả status `>=400` và có `message`, surface nguyên văn message tiếng Việt (vd: "Ngày bắt đầu là bắt buộc") thay vì code khô khan.

## Kiểm thử
1. Đăng nhập đã OK (test_login pass).
2. Vào tab "Lịch sử nội bộ" → "Đồng bộ từ Viettel" → chọn 30 ngày → Đồng bộ.
3. Xem log edge function: payload gửi đi phải có `fromDate: "DD/MM/YYYY"`.
4. Toast hiển thị `Đã đồng bộ X/Y hoá đơn`.

## File thay đổi
- `supabase/functions/vinvoice-api/index.ts` — chỉ action `sync_invoices`.
