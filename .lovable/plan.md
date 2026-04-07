

## Sửa lỗi gửi hình ảnh AI Quote Fill

### Nguyên nhân lỗi
1. **Ảnh gốc quá lớn** → base64 phình to → request body vượt giới hạn Edge Function hoặc timeout
2. **Không nén ảnh trước khi gửi** → ảnh 5-10MB gốc → base64 ~7-14MB
3. **Fallback models không hỗ trợ vision** → `glm-4.7-flash`, `glm-4.5-flash`, `openai/gpt-oss-120b` không hiểu ảnh → lỗi hoặc trả kết quả sai
4. **Edge Function timeout** → gemini-2.5-flash 55s không đủ cho ảnh lớn + phân tích

### Giải pháp

**1. Client — Nén ảnh trước khi gửi (`AIQuoteFill.tsx`)**
- Thêm hàm `compressImage()` dùng Canvas API để resize ảnh xuống max 1200px và chất lượng JPEG 0.7
- Giảm kích thước từ 5-10MB → ~100-300KB base64
- Gọi `compressImage()` trước `fileToBase64()` trong `handleAIFill`

**2. Backend — Chỉ dùng model hỗ trợ vision khi có ảnh (`lookup-tax-code/index.ts`)**
- Truyền flag `hasImage` vào `callAI()`
- Khi `hasImage = true`: chỉ thử models hỗ trợ vision (Lovable gateway gemini, Beeknoee gemini-2.5-flash)
- Bỏ qua các model text-only (glm, gpt-oss) khi có ảnh → tránh lỗi và tiết kiệm thời gian
- Tăng timeout gemini-2.5-flash lên 90s cho multimodal

### Flow sau sửa

```text
User chọn ảnh 5MB
→ Client nén xuống ~200KB via Canvas
→ Base64 ~270KB gửi lên Edge Function
→ callAI(messages, hasImage=true)
→ Thử Lovable gemini-3-flash (vision) → nếu lỗi → Beeknoee gemini-2.5-flash (vision)
→ BỎ QUA glm/gpt-oss (không hỗ trợ vision)
→ Trả kết quả nhanh, không timeout
```

| File | Thay đổi |
|------|----------|
| `src/components/AIQuoteFill.tsx` | Thêm `compressImage()`, gọi trước khi convert base64 |
| `supabase/functions/lookup-tax-code/index.ts` | `callAI` nhận flag `hasImage`, lọc model vision-only khi có ảnh, tăng timeout |

