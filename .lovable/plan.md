

## Phân biệt "Chăn hè" vs "Vỏ chăn chần" trong AI Quote Fill prompt

### Vấn đề
Dòng 637 hiện tại ghi `chan he/chăn hè=Vỏ chăn mỏng` — sai. Cần phân biệt rõ 2 loại sản phẩm khác nhau:
- **Chăn hè** = Chăn hè chần (SP độc lập, VD: "Chăn hè T250 sọc 200*220")
- **Vỏ chăn chần** = Vỏ chăn chần bông (loại khác, VD: "Vỏ chăn chần T350 sọc 170*235")

### Sửa đổi

**File**: `supabase/functions/lookup-tax-code/index.ts`

**Dòng 637** — Sửa mapping tiếng Việt không dấu:

Từ:
```
chan he/chăn hè=Vỏ chăn mỏng | chan dong=Vỏ chăn chần dày
```

Thành:
```
chan he/chăn hè=Chăn hè chần (SP riêng, KHÔNG phải vỏ chăn) | vo chan chan/vỏ chăn chần=Vỏ chăn chần bông (SP riêng, KHÔNG phải chăn hè) | chan dong=Vỏ chăn chần dày
```

Thêm vào phần SO KHỚP (sau dòng 634) một rule phân biệt:
```
4. PHÂN BIỆT: "chăn hè" → match "Chăn hè chần" (không có từ "vỏ"). "vỏ chăn chần" → match "Vỏ chăn chần bông". Hai loại KHÁC NHAU hoàn toàn.
```

Cũng cần cập nhật hàm `extractCategoryFilters` để tách keyword "chan he" và "vo chan chan" ra đúng category.

### Kết quả
- AI không nhầm lẫn giữa 2 dòng sản phẩm
- "chan he tran 2.0x2.2" → match đúng "Chăn hè chần T250 trơn 200*220"
- "vo chan chan soc 1m8" → match đúng "Vỏ chăn chần bông T250 sọc 180*210"

