

## Kết quả kiểm tra kết nối S-Invoice

### Phát hiện 2 vấn đề chính

#### Vấn đề 1: API `get_templates` trả về rỗng

Console log cho thấy:
```
get_templates raw response: {"success":true,"data":{"errorCode":null,"description":null,"totalRows":0,"template":null}}
```

**Nguyên nhân:** API đăng nhập thành công (không lỗi auth), nhưng endpoint `getInvoiceTemplates` trả về 0 kết quả. Có thể do:

- Request body gửi `{ taxCode, invoiceType }` nhưng Viettel API có thể yêu cầu field `supplierTaxCode` thay vì `taxCode`
- Hoặc `invoiceType` không đúng với loại hoá đơn đã đăng ký trên tài khoản S-Invoice

**Sửa:**
1. Thay đổi body request thành `{ supplierTaxCode: taxCode, invoiceType }` 
2. Thêm log chi tiết URL, body, response để debug nếu vẫn lỗi
3. Nếu vẫn rỗng, thử không truyền `invoiceType` để lấy tất cả mẫu

#### Vấn đề 2: Lưu hoá đơn bị chặn bởi RLS

Edge function logs:
```
Save draft error: new row violates row-level security policy for table "einvoices"
```

**Nguyên nhân:** Bảng `einvoices` có RLS yêu cầu `manager_id` khớp với user, nhưng **không có trigger `set_manager_id`** trên bảng này. Các bảng khác (orders, customers...) đều có trigger tự động gán `manager_id`, riêng `einvoices` thiếu.

**Sửa:** Tạo migration thêm trigger `set_manager_id` cho bảng `einvoices` (giống các bảng khác).

### Thay đổi

| File / Resource | Thay đổi |
|------|----------|
| `supabase/functions/vinvoice-api/index.ts` | Sửa body `get_templates`: dùng `supplierTaxCode`, thêm debug log |
| Migration SQL | Thêm trigger `set_manager_id` BEFORE INSERT trên `einvoices` |

### Không thay đổi
- Secrets đã cấu hình đầy đủ (VINVOICE_USERNAME, PASSWORD, TAX_CODE, API_URL)
- Logic đăng nhập API hoạt động bình thường
- Frontend CreateEInvoiceDialog

