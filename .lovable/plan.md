

## Thêm chức năng Ký & Đóng dấu Online

### Vấn đề
Khi giám đốc đi vắng, cần gửi bản mềm hợp đồng/đề nghị thanh toán/tạm ứng cho khách hàng có chữ ký và con dấu sẵn. Hiện tại phần chữ ký chỉ là khoảng trống.

### Giải pháp

#### 1. Thêm cột DB lưu ảnh chữ ký + con dấu

Thêm 2 cột mới vào bảng `quote_template_settings`:
- `signature_url` — ảnh chữ ký giám đốc (PNG trong suốt)
- `stamp_url` — ảnh con dấu công ty (PNG trong suốt)

Migration SQL:
```sql
ALTER TABLE quote_template_settings 
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS stamp_url text;
```

#### 2. Cập nhật hook `useTemplateSettings`

Thêm 2 field `signatureUrl` và `stampUrl` vào interface `TemplateSettings`, fetch/save từ DB.

#### 3. Cập nhật trang Cài đặt (`QuoteTemplateSettings.tsx`)

Thêm section "Chữ ký & Con dấu" cho phép upload:
- Ảnh chữ ký giám đốc
- Ảnh con dấu công ty
- Preview ảnh đã upload
- Sử dụng Supabase Storage bucket `logos` (đã có sẵn)

#### 4. Thêm toggle "Ký & đóng dấu" trên các tài liệu

Trên mỗi dialog (HĐ, ĐNTT, ĐNTU, HĐNT, Biên bản bàn giao), thêm checkbox/switch **"Đóng dấu & ký online"**. Khi bật:
- Hiển thị ảnh con dấu + chữ ký chồng lên vùng ký tên Bên A
- Hiển thị tên giám đốc (từ `seller_info.representative` hoặc mặc định "Trần Thị Thanh Hoan")
- Khi xuất PDF/Word, ảnh được nhúng vào file

Khi tắt: giữ nguyên khoảng trống như hiện tại (để in ra ký tay).

#### 5. Files thay đổi

| File | Thay đổi |
|------|----------|
| Migration SQL | Thêm 2 cột `signature_url`, `stamp_url` |
| `src/hooks/useTemplateSettings.ts` | Thêm `signatureUrl`, `stampUrl` |
| `src/components/QuoteTemplateSettings.tsx` | Thêm UI upload chữ ký + con dấu |
| `src/components/ContractPreviewDialog.tsx` | Toggle ký online + hiển thị ảnh |
| `src/components/PaymentRequestDialog.tsx` | Toggle ký online + hiển thị ảnh |
| `src/components/AdvanceRequestDialog.tsx` | Toggle ký online + hiển thị ảnh |
| `src/components/FrameworkContractDialog.tsx` | Toggle ký online + hiển thị ảnh |
| `src/components/HandoverReportDialog.tsx` | Toggle ký online + hiển thị ảnh |

#### 6. UI ký online (trong vùng chữ ký Bên A)

```text
┌──────────────────────┐
│  ĐẠI DIỆN BÊN A     │
│  (Ký, đóng dấu)     │
│                      │
│   [con dấu PNG]      │
│   [chữ ký PNG]       │
│                      │
│  Trần Thị Thanh Hoan │
│     Giám đốc         │
└──────────────────────┘
```

Ảnh con dấu và chữ ký sẽ được đặt chồng lên nhau bằng CSS `position: absolute` để trông tự nhiên giống ký thật.

