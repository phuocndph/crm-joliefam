

## Lấy danh sách mẫu hoá đơn & ký hiệu từ API S-Invoice

### Cách hoạt động

Khi mở dialog tạo hoá đơn, hệ thống tự động gọi API S-Invoice để lấy danh sách mẫu hoá đơn. Khi chọn mẫu, hệ thống tiếp tục gọi API để lấy danh sách ký hiệu tương ứng.

### Thay đổi

#### 1. Edge Function `vinvoice-api/index.ts`

Thêm action `get_templates`:
- Gọi API: `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceTemplates`
- Body: `{ taxCode: VINVOICE_TAX_CODE, invoiceType }` (mặc định `"01GTKT"`)
- Trả về danh sách `templateCode` và `invoiceSeries` cho frontend

#### 2. Frontend `CreateEInvoiceDialog.tsx`

- Khi dialog mở → gọi `get_templates` để lấy danh sách mẫu hoá đơn
- **Mẫu hoá đơn**: Select dropdown hiển thị các `templateCode` từ API
- **Ký hiệu hoá đơn**: Select dropdown hiển thị các `invoiceSeries` tương ứng với mẫu đã chọn
- Hiển thị loading state khi đang tải danh sách
- Tự động chọn mẫu/ký hiệu đầu tiên nếu chỉ có 1 option

### File thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/vinvoice-api/index.ts` | Thêm action `get_templates` gọi API S-Invoice |
| `src/components/CreateEInvoiceDialog.tsx` | Thay Input thành Select dropdown, load data từ API |

