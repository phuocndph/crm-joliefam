

## Tối ưu tốc độ AI Quote Fill — Lọc catalog theo category từ DB

### Phân tích vấn đề

- Catalog hiện tại: **917 SP** (~60K tokens) gửi toàn bộ mỗi lần
- Description trung bình 113 ký tự/SP → chiếm ~30% token catalog nhưng **không cần cho text-only matching**
- Lọc keyword trên text dễ sai (miss sản phẩm, viết tắt, không dấu)

### Giải pháp: 3 tầng tối ưu

**Tầng 1: Bỏ description cho text-only (an toàn 100%, giảm ~30% token)**

Khi không có ảnh, format catalog chỉ còn 4 cột: `ID|Tên|Quy cách|Giá`. Description chỉ cần khi phân tích ảnh.

**Tầng 2: Lọc category từ DB (an toàn, giảm 917 → ~100-200 SP)**

Thay vì lọc text, trích keyword từ input → map sang pattern category → lọc bằng SQL `ILIKE`. Đây là lọc ở tầng DB, chính xác 100%.

Bảng mapping keyword → category pattern:
```text
ga/ga chun     → '%Ga chun%'
ga phu/ga phủ  → '%Ga tấm phủ%'  
chan/chăn      → '%chăn%' (bắt cả vỏ chăn, chăn hè, chăn chần, ruột chăn)
goi/gối       → '%gối%', '%Vỏ gối%', '%Ruột gối%'
bvn/bảo vệ    → '%Bảo vệ%'
dem/đệm       → '%Đệm%'
topper         → '%Topper%'
khan/khăn      → '%Khăn%'
trang tri      → '%Trang Trí%'
vay/váy        → '%Váy%'
ao choang      → '%Áo choàng%'
ruot chan       → '%Ruột chăn%'
rem            → '%rem%'
```

Khi chất liệu rõ (T250, T300...) → thêm filter `AND category ILIKE '%T250%'` để thu hẹp thêm.

**Fallback an toàn**: Nếu sau lọc < 30 SP → gửi toàn bộ catalog (không lọc).

**Tầng 3: Rút gọn prompt (~20% token)**

Gộp các ví dụ trùng lặp, bỏ giải thích dài dòng, giữ nguyên logic.

### Sửa đổi

**File**: `supabase/functions/lookup-tax-code/index.ts`

1. Thêm hàm `extractCategoryFilters(request: string): string[]` — trả về mảng ILIKE patterns
2. Sửa query DB: thêm `.or(patterns.map(p => \`category.ilike.${p}\`).join(','))` khi có patterns
3. Bỏ `description` khỏi select khi `!imageBase64`
4. Rút gọn prompt (gộp ví dụ, bỏ text thừa)

### Kết quả kỳ vọng

| Metric | Trước | Sau |
|--------|-------|-----|
| SP gửi AI | 917 | 100-200 |
| Token catalog | ~60K | ~8-15K |
| Thời gian | 15-25s | 5-10s |
| Độ chính xác | 100% | 100% (fallback toàn bộ nếu lọc quá ít) |

