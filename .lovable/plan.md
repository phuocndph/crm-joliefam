

## Kết nối TYPE_TO_CATEGORY từ DB Config vào Edge Function

### Vấn đề
Config `ai_quote_type_categories` đã được lưu trong DB (11KB JSON chi tiết) nhưng Edge Function **không bao giờ đọc và áp dụng** nó. Hai hàm `filterProductsBySegments()` và `buildSegmentCandidates()` luôn dùng constant hardcode `TYPE_TO_CATEGORY` (25 entries cũ).

Kết quả: segment "vỏ chăn" chỉ match `['vỏ chăn']` nhưng DB dùng category như "VỎ CHĂN T250 SỌC", "Vỏ chăn T200 TRƠN"... → filter trả 0 products → AI bịa ID → sai hoàn toàn.

### Giải pháp

**File sửa: `supabase/functions/lookup-tax-code/index.ts`**

1. **Thêm hàm `buildTypeToCategory()`**: Parse JSON config từ DB thành `Record<string, string[]>` đơn giản.

```text
Input (từ DB):
{
  "TYPE_TO_CATEGORY": {
    "GA_CHUN": {
      "exact_keywords": ["ga chun"],
      "categories": ["Ga chun ks LTH SỌC", "Ga chun ks T200 TRƠN", ...]
    },
    "VO_CHAN": {
      "exact_keywords": ["vo chan", "vỏ chăn"],
      "categories": ["Vỏ chăn T200 TRƠN", "VỎ CHĂN T250 SỌC", ...]
    }
  }
}

Output:
{
  "ga chun": ["ga chun ks lth sọc", "ga chun ks t200 trơn", ...],
  "vo chan": ["vỏ chăn t200 trơn", "vỏ chăn t250 sọc", ...],
  "vỏ chăn": ["vỏ chăn t200 trơn", "vỏ chăn t250 sọc", ...],
  ...
}
```

2. **Sửa `filterProductsBySegments()` và `buildSegmentCandidates()`**: Nhận thêm param `typeToCategory` thay vì dùng global constant. Nếu DB config có → dùng custom, không có → fallback hardcode.

3. **Trong handler `ai_quote_fill`**: Sau khi `loadAIConfig()`, parse `ai_quote_type_categories` và truyền vào các hàm filter.

### Luồng mới

```text
ai_quote_fill request
  → loadAIConfig() → lấy ai_quote_type_categories JSON
  → buildTypeToCategory(json) → Record<string, string[]>
  → filterProductsBySegments(products, segments, customMapping)
  → buildSegmentCandidates(segments, products, customMapping)
  → AI match với đúng catalog đã lọc
```

### Kết quả mong đợi
- "vỏ chăn" T225 → match categories "Vỏ chăn T200 TRƠN", "VỎ CHĂN T250 SỌC"... → 60+ SP thay vì 0
- "vỏ gối" → match "Vỏ gối T250 SỌC"... → 61 SP thay vì 0  
- "ruột gối" → match "Ruột gối bông 3D"... → 16 SP thay vì 0

