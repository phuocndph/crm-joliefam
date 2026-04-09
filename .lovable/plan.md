

## Sửa lỗi: Model `gemini-2.0-flash-lite` không có prefix `google/`

### Nguyên nhân gốc

Trong hàm `callAI`, khi `modelOverride` = `"google/gemini-2.0-flash-lite"` thất bại (400), code fallback vào model chain. Nhưng model chain ở line 1023 và 1027 ghi `"gemini-2.0-flash-lite"` **thiếu prefix `google/`** → Beeknoee không nhận ra → 400 tiếp → fallback cuối cùng về `gemini-2.5-flash` (chậm 9-11s).

### Sửa

**File: `supabase/functions/lookup-tax-code/index.ts`**

- **Line 1023**: `"gemini-2.0-flash-lite"` → `"google/gemini-2.0-flash-lite"`
- **Line 1024**: `"gemini-2.5-flash"` → `"google/gemini-2.5-flash"`
- **Line 1027**: `"gemini-2.0-flash-lite"` → `"google/gemini-2.0-flash-lite"`
- **Line 1028**: `"gemini-2.5-flash"` → `"google/gemini-2.5-flash"`

Tức là thêm prefix `google/` cho **tất cả** model trong chain, giống format đã dùng ở `modelOverride` (line 1012) và `ocrModel` (line 1443).

### Sau khi sửa
- `google/gemini-2.0-flash-lite` sẽ được gọi đúng → OCR chỉ mất ~1-3s thay vì 10s
- `google/gemini-2.5-flash` chỉ là fallback khi model lite thực sự lỗi

### Deploy lại edge function sau khi sửa

