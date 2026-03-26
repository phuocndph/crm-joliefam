

## Sửa lỗi kết nối API S-Invoice

### Phát hiện từ log và nghiên cứu

API trả về lỗi:
```
{"code":400,"message":"TAX_CODE_REQUIRED","data":"Mã số thuế bắt buộc nhập"}
```
Dù đã gửi `supplierTaxCode` trong body.

Sau khi nghiên cứu source code thư viện Viettel S-Invoice chính thức (`dev10katec/viettel-s-invoice`), phát hiện **2 lỗi nghiêm trọng**:

### Lỗi 1: Sai tên field trong `getInvoiceTemplates`

| Hiện tại (sai) | Thư viện Viettel (đúng) |
|---|---|
| `{ supplierTaxCode: taxCode }` | `{ taxCode: username }` |

Endpoint `getInvoiceTemplates` yêu cầu field `taxCode`, **không phải** `supplierTaxCode`. Và giá trị phải là **username** đăng nhập Viettel (ví dụ: `0108652480-509`), không phải mã số thuế thuần.

### Lỗi 2: Sai phương thức xác thực

| Hiện tại (sai) | Thư viện Viettel (đúng) |
|---|---|
| `Cookie: access_token=...` | `Authorization: Bearer ...` |

Tất cả các API call đang dùng Cookie để gửi token. Thư viện Viettel chính thức dùng `Authorization: Bearer` header.

### Kế hoạch sửa

**File: `supabase/functions/vinvoice-api/index.ts`**

1. **`getInvoiceTemplates`**: Đổi body từ `{ supplierTaxCode }` sang `{ taxCode: username }`, dùng `Authorization: Bearer` header
2. **`createInvoice`**: Đổi từ `Cookie` sang `Authorization: Bearer` header
3. **`getInvoiceFile`**: Đổi từ `Cookie` sang `Authorization: Bearer` header
4. Thêm helper `getAuthHeaders(token)` trả về `{ "Content-Type": "application/json", Authorization: "Bearer " + token }` để dùng chung

### Chi tiết kỹ thuật

```text
Trước:
  headers: { Cookie: `access_token=${token}` }
  body: { supplierTaxCode: VINVOICE_TAX_CODE }

Sau:
  headers: { Authorization: `Bearer ${token}` }
  body: { taxCode: VINVOICE_USERNAME, invoiceType: "..." }
```

| File | Thay đổi |
|------|----------|
| `supabase/functions/vinvoice-api/index.ts` | Sửa auth header và field name cho tất cả API calls |

