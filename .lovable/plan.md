

## Vấn đề

**MST sai trên hợp đồng cũ**: Cài đặt DB hiện tại có MST đúng = `0108652480`, nhưng tất cả hợp đồng đã tạo đều lưu `seller_info.tax_code = 0134345789` (giá trị cũ). Khi hiển thị, hệ thống ưu tiên lấy từ `seller_info` trong hợp đồng → hiển thị MST sai.

**Nguyên nhân gốc**: Khi tạo hợp đồng, `seller_info` được snapshot từ cài đặt tại thời điểm tạo (đúng logic). Nhưng nếu cài đặt thay đổi sau đó, các hợp đồng cũ vẫn giữ giá trị cũ.

## Giải pháp

Thay đổi logic hiển thị ở **4 file** để luôn ưu tiên dữ liệu từ cài đặt công ty (settings) thay vì từ `seller_info` đã lưu trong hợp đồng. Đồng thời cập nhật MST sai trong các hợp đồng cũ.

### 1. Đảo ưu tiên fallback (4 files)

Hiện tại: `seller.tax_code || companySettings.taxCode` (ưu tiên dữ liệu cũ)
Sửa thành: `companySettings.taxCode || seller.tax_code` (ưu tiên cài đặt mới nhất)

Áp dụng cho **tất cả trường** (company_name, tax_code, bank_info, address, phone) ở 4 file:

| File | Mô tả |
|------|--------|
| `ContractPreviewDialog.tsx` | Hợp đồng kinh tế |
| `FrameworkContractDialog.tsx` | Hợp đồng nguyên tắc |
| `PaymentRequestDialog.tsx` | Đề nghị thanh toán |
| `AdvanceRequestDialog.tsx` | Đề nghị tạm ứng |

### 2. Cập nhật hợp đồng cũ trong DB

Chạy migration SQL để cập nhật `seller_info.tax_code` từ `0134345789` → `0108652480` cho tất cả hợp đồng hiện có, đảm bảo dữ liệu nhất quán.

```sql
UPDATE contracts 
SET seller_info = jsonb_set(seller_info::jsonb, '{tax_code}', '"0108652480"')
WHERE seller_info->>'tax_code' = '0134345789';
```

### Tóm tắt

- **Hiệu ứng**: Tất cả tài liệu (HĐ, ĐNTT, ĐNTU, HĐNT) sẽ luôn hiển thị thông tin công ty mới nhất từ cài đặt
- **Fallback**: Nếu cài đặt chưa load xong, vẫn hiển thị từ `seller_info` đã lưu
- **DB fix**: Sửa MST sai trong hợp đồng cũ

