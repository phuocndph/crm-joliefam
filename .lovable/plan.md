

## Tạo trang Cài đặt AI Quote Fill

### Mục tiêu
Tạo trang cài đặt riêng cho hệ thống AI Quote Fill, cho phép Admin/Manager kiểm soát toàn bộ pipeline: prompt, model, catalog filtering, và debug logs.

### Thiết kế

**Trang mới**: `src/pages/AISettingsPage.tsx` — truy cập từ nút bên cạnh "Cài đặt Template" trên trang Báo giá.

**Các section chính:**

1. **Prompt System** — Hiển thị và cho phép chỉnh sửa `aiQuoteFillPrompt` (prompt chính gửi cho AI). Lưu vào bảng `ai_settings` với key `ai_quote_fill_prompt`. Nếu trống → dùng prompt mặc định từ edge function.

2. **Model Selection** — Chọn model cho từng loại request:
   - Text-only (hiện tại: `google/gemini-2.5-flash`)
   - Image (hiện tại: `google/gemini-3-flash-preview`)
   - Danh sách models: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro, gemini-3-flash-preview, gpt-5-mini

3. **Catalog & Filtering** — Hiển thị và chỉnh sửa:
   - `TYPE_TO_CATEGORY` mapping (segment type → DB category)
   - `PRODUCT_TYPE_KEYWORDS` list
   - `MATERIAL_KEYWORDS` list
   - Cache TTL (hiện tại 5 phút)

4. **Test & Debug** — Textarea nhập input mẫu, gửi test và hiển thị:
   - Parsed segments
   - Filtered products count
   - AI response raw JSON
   - Validation warnings

### Thay đổi kỹ thuật

**Files mới:**
- `src/pages/AISettingsPage.tsx` — Trang chính với 4 tabs (Prompt, Model, Catalog, Test)

**Files sửa:**
- `src/pages/QuotesPage.tsx` — Thêm nút "Cài đặt AI" bên cạnh "Cài đặt Template"
- `src/App.tsx` — Thêm route `/ai-settings`
- `src/components/ui/app-sidebar.tsx` — Thêm menu item (chỉ admin/manager)
- `supabase/functions/lookup-tax-code/index.ts` — Đọc custom prompt/model/catalog config từ DB thay vì hardcode. Thêm endpoint `type: "ai_quote_debug"` trả về parsed segments + filtered products để debug.

**Database migration:**
- Tận dụng bảng `ai_settings` có sẵn, thêm các setting keys mới: `ai_quote_fill_prompt`, `ai_quote_text_model`, `ai_quote_image_model`, `ai_quote_type_categories`, `ai_quote_keywords`

### Luồng hoạt động
1. Admin mở trang AI Settings → load settings từ `ai_settings`
2. Chỉnh sửa prompt/model/catalog → Save → upsert vào `ai_settings`
3. Edge function khi xử lý `ai_quote_fill` → đọc settings từ DB (cache 5 phút) → dùng custom prompt/model nếu có
4. Tab Test: gửi input → edge function trả debug info + kết quả AI → hiển thị trực quan

