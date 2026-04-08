

## Đổi model chain Step 2 sang Gemini 3 Flash + Gemini 2.5 Flash

### Vấn đề
Step 2 text matching đang ưu tiên GLM models (`glm-4.7-flash`, `glm-4.5-flash`) → liên tục timeout và 429 → mất 87s rồi mới fallback về Gemini → hoặc fail hoàn toàn.

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts`** (dòng 1025-1031)

Đổi model chain cho `stepHint === 'text'` từ:
```
glm-4.7-flash → glm-4.5-flash → gemini-2.5-flash → gpt-oss-120b
```

Thành:
```
gemini-3-flash-preview → gemini-2.5-flash
```

Bỏ GLM và GPT-OSS — chỉ dùng Gemini cho cả 2 bước. Vì Step 1 OCR dùng `gemini-3-flash-preview`, Step 2 sẽ thử `gemini-3-flash-preview` trước (có thể slot đã giải phóng sau delay), rồi fallback `gemini-2.5-flash`.

### Kết quả mong đợi
- Step 2 không còn mất 60-87s chờ GLM timeout
- Tổng thời gian: ~20-30s thay vì 100s+

