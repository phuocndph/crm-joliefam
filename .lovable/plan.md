

## Các lỗi phát hiện và kế hoạch sửa

### Lỗi 1: Dữ liệu form mới không được truyền vào API

**Vấn đề:** Frontend thu thập `currency`, `exchangeRate`, `contractNumber`, `paymentDetail`, `buyerBankName`, `buyerBankAccount`, `buyerIdType`, `buyerIdNumber`, `copyCount` nhưng **không truyền** vào `options` khi gọi API. Chúng bị bỏ qua hoàn toàn.

**Sửa:** Cập nhật `handleCreateInvoice` và `handleSaveDraft` để truyền tất cả fields mới vào `options`.

---

### Lỗi 2: `mapContractToInvoice` (Edge Function) không dùng các trường mới

**Vấn đề:**
- `currencyCode` hardcode `"VND"` thay vì dùng `options.currency`
- Không map `buyerBankName`, `buyerBankAccount` từ `buyerInfo`
- Không gửi `contractNumber`, `buyerIdType`, `buyerIdNumber` vào payload S-Invoice
- Không truyền `paymentDetail` vào `generalInvoiceInfo`

**Sửa:** Cập nhật `mapContractToInvoice` để đọc từ `options` và `buyerInfo`:
- `currencyCode: options.currency || "VND"`
- `buyerBankName`, `buyerBankAccount` trong `buyerInfo`
- `contractNumber` → field `contractNo` trong `generalInvoiceInfo`
- `exchangeRate` → field `exchangeRate`

---

### Lỗi 3: `create_draft` gọi sai endpoint

**Vấn đề:** Action `create_draft` gọi endpoint `createInvoice/{taxCode}` (phát hành thật) thay vì endpoint xem trước/nháp. Hoá đơn nháp nên chỉ lưu local vào DB, không gọi API S-Invoice tạo thật.

**Sửa:** Bỏ gọi API S-Invoice trong `create_draft`, chỉ build payload và lưu vào bảng `einvoices` với `status: "draft"`. Khi phát hành sau thì mới gọi API.

---

### Lỗi 4: Checkbox "Người mua không lấy HĐ" không có logic

**Vấn đề:** Khi check `noInvoiceBuyer`, các input bị disable nhưng `buildInvoicePayload` vẫn gửi thông tin buyer cũ. API S-Invoice cần field `cusGetInvoiceRight: false`.

**Sửa:** Khi `noInvoiceBuyer = true`:
- `buildInvoicePayload` trả buyer_info rỗng
- Truyền `cusGetInvoiceRight: false` vào options
- Edge function set `cusGetInvoiceRight: false` trong `generalInvoiceInfo`

---

### File thay đổi

| File | Thay đổi |
|------|----------|
| `src/components/CreateEInvoiceDialog.tsx` | Truyền đầy đủ fields vào options, xử lý noInvoiceBuyer |
| `supabase/functions/vinvoice-api/index.ts` | Cập nhật mapContractToInvoice, sửa create_draft |

