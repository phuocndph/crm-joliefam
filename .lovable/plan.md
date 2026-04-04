

## Thêm chức năng kéo thả & phóng to/thu nhỏ con dấu và chữ ký

### Ý tưởng
Cho phép người dùng **kéo thả** (drag) và **phóng to/thu nhỏ** (resize) con dấu + chữ ký trực tiếp trên preview tài liệu, sau đó **lưu vị trí & kích thước** vào DB để áp dụng cho tất cả tài liệu.

### Thay đổi

#### 1. Migration — Thêm cột lưu vị trí & kích thước

Thêm 4 cột vào `quote_template_settings`:
- `stamp_position` (jsonb) — `{ x, y, width, height }`  
- `signature_position` (jsonb) — `{ x, y, width, height }`

Giá trị mặc định:
- Stamp: `{ x: 5, y: 50, width: 160, height: 160 }`
- Signature: `{ x: 30, y: 45, width: 140, height: 100 }`

#### 2. Hook `useTemplateSettings.ts`
- Thêm `stampPosition` và `signaturePosition` vào interface
- Fetch/save từ DB

#### 3. Component `OnlineStampSignature.tsx` — Thêm interactive mode

Khi ở **chế độ chỉnh sửa** (prop `editable={true}`):
- Mỗi ảnh có viền nét đứt + handle resize ở góc
- Kéo thả bằng mouse/touch events (`onMouseDown/Move/Up`)
- Resize bằng handle góc dưới-phải
- Hiển thị nút **"Lưu vị trí"** để save vào DB

Khi ở **chế độ xem** (mặc định): hiển thị bình thường theo vị trí đã lưu.

#### 4. Trang Cài đặt (`QuoteTemplateSettings.tsx`)
- Thêm section preview con dấu + chữ ký với `editable={true}`
- Người dùng kéo thả và resize tại đây, bấm Lưu

#### 5. Files thay đổi

| File | Thay đổi |
|------|----------|
| Migration SQL | Thêm 2 cột jsonb |
| `useTemplateSettings.ts` | Thêm stampPosition, signaturePosition |
| `OnlineStampSignature.tsx` | Drag & resize logic + editable mode |
| `QuoteTemplateSettings.tsx` | Preview editable cho kéo thả |
| `types.ts` | Cập nhật DB types |

