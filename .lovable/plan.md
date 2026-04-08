

## Tối ưu AI Quote Fill: Tách xử lý ảnh thành 2 bước

### Luồng hiện tại (tốn token)
```text
Client: gửi imageBase64 + catalog 917 SP → AI (multimodal)
AI nhận: ảnh + prompt dài + toàn bộ catalog = ~30K-50K tokens
Model: phải dùng vision model (chậm hơn, đắt hơn)
```

### Luồng mới (tiết kiệm)
```text
Bước 1: Client gửi imageBase64 → AI OCR (prompt nhỏ, không catalog)
         AI trả về: text mô tả sản phẩm (~200-500 tokens)
         
Bước 2: Dùng text đó → chạy logic text bình thường
         (segment parsing → filter catalog → AI match với text model nhanh)
```

### Thay đổi

**File: `supabase/functions/lookup-tax-code/index.ts`**

Trong handler `ai_quote_fill`, khi `imageBase64` có:

1. **Bước 1 — OCR**: Gọi AI vision model với prompt ngắn (chỉ ~500 tokens):
```text
"Trích xuất danh sách sản phẩm từ ảnh. Ghi lại: tên SP, số lượng, kích thước, chất liệu, giá (nếu có).
Trả về dạng text thuần, mỗi dòng 1 sản phẩm. VD: ga chun T250 sọc 180x200 x2"
```
→ Nhận text ~200-500 ký tự

2. **Bước 2 — Ghép text**: Nối text OCR với `request` gốc (nếu có), rồi chạy luồng text bình thường:
   - `parseRequestSegments(ocrText)` → segments
   - `filterProductsBySegments()` → filtered catalog
   - Gọi AI text model (nhanh, rẻ) với catalog đã lọc

**Lợi ích**:
- Bước 1: ~1K tokens (ảnh + prompt OCR ngắn, không catalog)
- Bước 2: ~5-10K tokens (text + catalog đã lọc, dùng flash-lite)
- Tổng: ~6-11K tokens thay vì ~30-50K tokens → **tiết kiệm 60-80%**
- Dùng text model nhanh hơn ở bước 2

**File: `src/components/AIQuoteFill.tsx`**
- Không thay đổi logic client — vẫn gửi imageBase64 như cũ
- Chỉ cần bỏ gửi description trong catalog khi có ảnh (đã không cần vì bước 2 là text)

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Tách multimodal thành 2 bước: OCR → text matching |

