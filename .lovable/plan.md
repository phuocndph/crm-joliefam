

## Tối ưu tốc độ OCR ảnh từ ~28s xuống 2-5s

### Nguyên nhân chậm
Model `gemini-2.5-flash` là model **"thinking"** — nó suy luận nội bộ trước khi trả lời, ngay cả với task đơn giản như OCR. Kết quả: 28.7s cho 6 dòng text.

### Giải pháp: Dùng model nhanh hơn cho OCR

**File: `supabase/functions/lookup-tax-code/index.ts` (line 1449)**

Đổi default OCR model từ `gemini-2.5-flash` sang `gemini-2.0-flash-lite`:

```typescript
// TRƯỚC
const ocrModel = aiConfig['ai_quote_ocr_model'] || "google/gemini-2.5-flash";

// SAU
const ocrModel = aiConfig['ai_quote_ocr_model'] || "google/gemini-2.0-flash-lite";
```

`gemini-2.0-flash-lite` là model nhẹ, không có bước "thinking", phù hợp cho OCR thuần — trích xuất text từ ảnh không cần suy luận phức tạp. Tốc độ dự kiến: **2-5s** thay vì 28s.

Nếu Beeknoee không hỗ trợ `gemini-2.0-flash-lite`, fallback sang `gemini-2.0-flash` (cũng nhanh hơn 2.5-flash rất nhiều cho OCR).

**Thay đổi model chain cho OCR trong `callAI` (line 1021-1024):**

```typescript
const models = hasImage
  ? [
      { name: "gemini-2.0-flash-lite", timeout: 30000 },
      { name: "gemini-2.0-flash", timeout: 45000 },
      { name: "gemini-2.5-flash", timeout: 90000 },  // fallback cuối
    ]
```

Thêm 2 model nhanh hơn vào đầu chain cho image tasks, giữ `gemini-2.5-flash` làm fallback cuối.

### Cũng có thể cấu hình từ DB
User có thể vào bảng `ai_config`, đổi key `ai_quote_ocr_model` thành `gemini-2.0-flash-lite` hoặc `gemini-2.0-flash` mà không cần deploy lại.

### Tóm tắt
- Sửa 2 chỗ trong `lookup-tax-code/index.ts`: default model + model chain
- Deploy lại edge function
- Không thay đổi logic, chỉ đổi model

