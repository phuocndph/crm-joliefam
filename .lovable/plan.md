

## Cải thiện AI chọn sản phẩm: suy luận loại vải, phân biệt vỏ/ruột gối, hỏi lại khi thiếu info

### Vấn đề
- AI nhầm "vỏ gối" với "ruột gối"
- Khi ga là T225 thì gối cũng phải T225, nhưng AI không suy luận được
- Khi thiếu thông tin, AI đoán bừa thay vì hỏi lại

### Thay đổi

#### 1. Edge Function prompt (`supabase/functions/lookup-tax-code/index.ts`)

Thêm 3 quy tắc mới sau rule 7:

**Rule 8 - Suy luận loại vải**: Nếu đơn có GA loại vải cụ thể (T225, T250, KS, Tencel...), tất cả phụ kiện (vỏ gối, gối ôm) PHẢI theo cùng loại vải đó, trừ khi khách ghi rõ loại vải riêng.

**Rule 9 - Phân biệt sản phẩm**: 
- "Vỏ gối" ≠ "Ruột gối" — vỏ theo loại vải, ruột là lõi bông bên trong
- Nếu khách chỉ nói "gối" không rõ vỏ/ruột → mặc định "vỏ gối"
- Chỉ chọn "ruột gối" khi khách ghi rõ "ruột gối", "lõi gối", "gối bông"

**Rule 10 - Hỏi lại**: Nếu thiếu thông tin quan trọng và không thể suy luận → trả `{"items": [], "clarification": "câu hỏi cần bổ sung"}` thay vì đoán sai.

#### 2. Frontend (`src/components/AIQuoteFill.tsx`)

Trong `handleAIFill`, sau khi nhận response từ AI:
- Kiểm tra `data?.clarification` — nếu có, hiển thị toast với nội dung câu hỏi bổ sung thay vì báo "không tìm thấy sản phẩm"
- Giữ nguyên textarea để user bổ sung thông tin và thử lại

### Files thay đổi

| File | Thay đổi |
|------|----------|
| `supabase/functions/lookup-tax-code/index.ts` | Thêm rule 8 (suy luận loại vải), rule 9 (phân biệt vỏ/ruột), rule 10 (hỏi lại) vào prompt |
| `src/components/AIQuoteFill.tsx` | Xử lý response `clarification` — hiển thị câu hỏi bổ sung |

