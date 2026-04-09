

## Sửa lỗi model sai trong DB và validation khi lưu

### Vấn đề gốc
Bảng `ai_config` đang lưu 3 model không hợp lệ:
- `ai_quote_text_model` = `gpt-5-nano` (không tồn tại)
- `ai_quote_image_model` = `google/gemini-2.5-flash` (sai prefix)
- `ai_quote_ocr_model` = `google/gemini-3-flash-preview` (sai prefix + có thể không tồn tại)

→ Mỗi request text matching mất ~90s do fallback chain.

### Sửa

**1. Cập nhật DB — sửa 3 giá trị model sai**

```sql
UPDATE ai_config SET config_value = 'gemini-2.5-flash-lite' WHERE config_key = 'ai_quote_text_model';
UPDATE ai_config SET config_value = 'gemini-2.5-flash' WHERE config_key = 'ai_quote_image_model';
UPDATE ai_config SET config_value = 'gemini-2.5-flash-lite' WHERE config_key = 'ai_quote_ocr_model';
```

**2. File `src/pages/AISettingsPage.tsx` — Validate model trước khi lưu**

Khi người dùng chọn model từ dropdown, đảm bảo giá trị lưu vào DB không có prefix `google/`. Thêm logic strip prefix trước khi ghi:

```typescript
// Strip google/ prefix before saving
const cleanModel = (model: string) => model.replace(/^google\//, '');
```

**3. File `supabase/functions/lookup-tax-code/index.ts` — Defensive strip prefix khi đọc từ DB**

Trong hàm đọc model từ DB config, tự động loại bỏ prefix `google/` để tránh lỗi tương tự trong tương lai:

```typescript
const cleanModelName = (name: string) => name?.replace(/^google\//, '') || '';
```

Áp dụng tại:
- Line 1636: `configTextModel` 
- Line 1736: `textModel`
- Bất kỳ nơi nào đọc model từ `aiConfig`/`dbConfig`

### Kết quả mong đợi
- Text matching: ~3-5s (thay vì 90s)
- OCR: ~2-3s
- Không bị lỗi model sai nữa dù người dùng cấu hình nhầm prefix

