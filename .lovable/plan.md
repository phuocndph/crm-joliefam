

## Làm lại toàn bộ AI Quote Fill — Chỉ dùng Beeknoee

### Thay đổi so với plan trước
User muốn dùng **Beeknoee**, không phải Gemini trực tiếp. Bỏ hoàn toàn Lovable AI, gọi thẳng Beeknoee làm provider duy nhất.

### Kiến trúc mới

```text
Frontend (AIQuoteFill.tsx)
  → Edge Function (ai-quote-fill/index.ts)  ← MỚI
    → build-product-catalog (lấy catalogText)
    → Beeknoee API (gemini-2.5-flash, 1 model duy nhất, timeout 30s)
  → Trả kết quả JSON
```

### Chi tiết thay đổi

#### 1. Tạo Edge Function mới: `supabase/functions/ai-quote-fill/index.ts`
- Tách riêng khỏi `lookup-tax-code` (giữ nguyên file cũ cho các chức năng khác)
- Gọi Beeknoee API trực tiếp: `https://platform.beeknoee.com/api/v1/chat/completions`
- Dùng `BEEKNOEE_API_KEY` (đã có)
- Model: `gemini-2.5-flash` duy nhất, timeout 30s, không fallback chain
- Không tool calling (Beeknoee không hỗ trợ tốt) → yêu cầu trả JSON text
- Nhận `catalogText` hoặc `products` từ frontend
- Trả JSON: `{ items: [...], clarification?: string, usedModel, usedProvider }`
- Validate JWT từ Authorization header

#### 2. Viết lại `src/components/AIQuoteFill.tsx`
- Bỏ: model selector (4 tier), preFilterProducts, Lovable AI error handling, AI_MODELS array
- Giữ: textarea + nút + bảng preview, image matching, clarification, catalog cache/build
- Gọi edge function mới `ai-quote-fill` thay vì `lookup-tax-code`
- 1 nút "AI phân tích" duy nhất, không chọn model
- Giữ nút "Cập nhật danh mục" và switch hình ảnh

#### 3. Không sửa `lookup-tax-code`
- Giữ nguyên cho parse_text, parse_image, parse_order_text, tax_code...
- Frontend chỉ không gọi `ai_quote_fill` type nữa

### Tại sao tách function mới tốt hơn sửa cũ
- `lookup-tax-code` đã 634 dòng, quá phức tạp
- Tách riêng dễ debug, deploy, không ảnh hưởng các chức năng khác
- Timeout riêng, không bị chia sẻ với các type khác

### Thay đổi file

| File | Hành động |
|------|-----------|
| `supabase/functions/ai-quote-fill/index.ts` | Tạo mới — gọi Beeknoee trực tiếp, 1 model, 30s timeout |
| `src/components/AIQuoteFill.tsx` | Viết lại — bỏ model selector, gọi function mới |

### Hiệu quả dự kiến

| Metric | Hiện tại | Sau fix |
|--------|----------|---------|
| Provider chain | Lovable → Beeknoee (4 model × 2 retry) | Beeknoee (1 model) |
| Timeout tổng | ~96s rồi fail | 30s max |
| Payload | 917 SP (55KB) khi catalog lỗi | catalogText (~2KB) |
| Best case | Không thành công | 5-10s |
| Worst case | 96s fail | 30s fail với lỗi rõ ràng |

