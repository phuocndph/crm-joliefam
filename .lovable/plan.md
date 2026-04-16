

## Fix: Test & Debug chưa dùng đúng prompt và catalog

### Vấn đề phát hiện

**Bug 1 — Custom prompt không được interpolate đúng (line 1789)**
Khi có `config.customPrompt`, debug mode dùng nó trực tiếp làm system prompt mà KHÔNG thay thế `${productListText}`, `${segmentInstruction}`, `${catalogHeader}`. Kết quả: AI nhận prompt có placeholder text thô thay vì danh sách sản phẩm thực tế.

Trong khi flow thật (`ai_quote_fill`, line 1616-1619) có `.replace()` đúng cách.

**Bug 2 — Catalog không lọc theo bảng giá (line 1731-1735)**
Debug mode fetch ALL products (`products.eq("in_stock", true)`) mà không lọc theo `priceListId`. Flow thật dùng `priceListId` để chỉ lấy sản phẩm thuộc bảng giá đang dùng.

**Bug 3 — Thiếu `catalogHeader` variable**
Debug mode không khai báo `catalogHeader`, nên khi interpolate custom prompt sẽ bị `undefined`.

### Giải pháp

**File: `supabase/functions/lookup-tax-code/index.ts`** — Sửa phần `ai_quote_debug` (line 1700-1821):

1. **Thêm `priceListId` từ client config** và lọc products theo nó (giống flow thật)
2. **Thêm `catalogHeader`** = `"ID|Tên|Quy cách|Giá"`
3. **Interpolate custom prompt** giống flow thật (line 1616-1619):
   ```typescript
   let systemPrompt: string;
   if (config?.customPrompt) {
     systemPrompt = config.customPrompt
       .replace(/\$\{catalogHeader\}/g, catalogHeader)
       .replace(/\$\{productListText\}/g, productListText)
       .replace(/\$\{segmentInstruction\}/g, segmentInstruction);
   } else {
     systemPrompt = defaultPrompt;
   }
   ```

**File: `src/pages/AISettingsPage.tsx`** — Truyền `priceListId` vào config (line 314-329):
- Thêm dropdown chọn bảng giá cho test (hoặc tự detect bảng giá mặc định)
- Truyền `priceListId` trong body để debug dùng đúng catalog

### Kết quả
Test & Debug sẽ sử dụng chính xác prompt đã cập nhật (với sản phẩm được inject vào) và catalog đúng bảng giá, cho kết quả giống hệt flow thật.

