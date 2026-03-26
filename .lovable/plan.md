

## Thêm quét MST bên mua & tạo hoá đơn nháp

### 1. Quét thông tin bên mua theo MST

**File:** `src/components/CreateEInvoiceDialog.tsx`

Thêm nút "Tra cứu" bên cạnh ô Mã số thuế trong phần Bên mua (standalone mode). Khi nhập MST và bấm tra cứu:
- Gọi edge function `lookup-tax-code` (đã có sẵn, action `tax_code`) để lấy thông tin doanh nghiệp
- Tự động điền: Tên công ty, Địa chỉ, Người đại diện, SĐT
- Hiển thị loading spinner khi đang tra cứu
- Toast thông báo kết quả (thành công / không tìm thấy)

Tương tự tính năng trên vinvoice.viettel.vn — nhập MST → hệ thống tự điền thông tin người mua.

### 2. Tạo hoá đơn nháp (Draft)

**File:** `src/components/CreateEInvoiceDialog.tsx` + `supabase/functions/vinvoice-api/index.ts`

Thêm action `create_draft` trong edge function gọi API S-Invoice endpoint:
```
POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/previewDraftInvoice
```

Frontend: Thêm nút "Lưu nháp" bên cạnh nút "Phát hành hoá đơn". Hoá đơn nháp được lưu vào bảng `einvoices` với status = `draft`, cho phép xem lại và phát hành sau.

### Tóm tắt thay đổi

| File | Thay đổi |
|------|----------|
| `src/components/CreateEInvoiceDialog.tsx` | Thêm nút tra cứu MST, nút Lưu nháp |
| `supabase/functions/vinvoice-api/index.ts` | Thêm action `create_draft` gọi previewDraftInvoice API |

### Không thay đổi
- Database schema (dùng status `draft` đã có)
- Edge function `lookup-tax-code` (dùng nguyên)
- Các trang khác

