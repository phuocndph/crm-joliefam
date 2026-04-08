

## Cải tiến bộ lọc AI Quote Fill — Phân tích ngữ cảnh vải trước khi lọc

### Phân tích vấn đề hiện tại

Bộ lọc hiện tại có 2 lỗi cốt lõi:

1. **Lọc vật liệu toàn cục** — `T250` xuất hiện ở cuối câu → áp cho MỌI sản phẩm → loại mất "Chăn hè" nếu tên SP chăn hè trong DB không chứa `T250` đúng vị trí
2. **Không phân biệt SP cần vải vs không cần vải** — Bảo vệ nệm, khăn, tấm trang trí, ruột chăn/gối, topper KHÔNG cần lọc theo vật liệu vải

### Dữ liệu thực từ DB

Nhóm SP **CÓ vải** (category chứa T200/T250/T300/LTH...):
- Ga chun ks T250 TRƠN, Ga tấm phủ T300 SỌC, CHĂN HÈ T250 TRƠN, VỎ CHĂN CHẦN T250 SỌC, Vỏ gối...

Nhóm SP **KHÔNG CÓ vải** trong category:
- Bảo vệ nệm chần bông, Khăn tắm, Tấm Trang Trí, Ruột chăn, Ruột gối, Topper, Đệm, Váy giường, Áo choàng

### Giải pháp: Tách request → gán vải theo ngữ cảnh → lọc thông minh

**File**: `supabase/functions/lookup-tax-code/index.ts`

#### 1. Thêm hàm `parseRequestSegments(request)` — Tách cụm SP + gán vải

Logic:
- Quét request từ trái → phải
- Khi gặp từ khóa vải (T250, T300, LTH, MCR...) + mẫu (trơn/sọc) → lưu làm "vải hiện tại"
- Khi gặp từ khóa SP (ga chun, chăn hè, vỏ gối...) → tạo 1 segment, gắn vải hiện tại nếu SP thuộc nhóm cần vải
- SP không cần vải (bvn, khăn, tấm trang trí, ruột, topper, đệm) → không gắn vải

```text
Input: "T300 sọc Ga chun 150x200x10cm T250 trơn Vỏ chăn 200x220 Chăn hè 200x220 --- Vải LTH Vỏ gối 45x65 Bảo vệ đệm 160x200 Khăn tắm 60x120"

Kết quả parse:
  Segment 1: { type: "ga chun", material: "T300", pattern: "sọc", size: "150x200x10" }
  Segment 2: { type: "vỏ chăn", material: "T250", pattern: "trơn", size: "200x220" }
  Segment 3: { type: "chăn hè", material: "T250", pattern: "trơn", size: "200x220" }
  Segment 4: { type: "vỏ gối", material: "LTH", pattern: null, size: "45x65" }
  Segment 5: { type: "bảo vệ đệm", material: null, pattern: null, size: "160x200" }  ← không cần vải
  Segment 6: { type: "khăn tắm", material: null, pattern: null, size: "60x120" }  ← không cần vải
```

#### 2. Sửa `filterProductsByCategory()` — Lọc theo từng segment

Thay vì lọc 1 lần toàn cục:
- Mỗi segment lọc riêng → lấy union kết quả
- Segment có vải → lọc category chứa cả loại SP + vải + mẫu
- Segment không có vải → chỉ lọc category theo loại SP
- Fallback: nếu 1 segment lọc ra 0 kết quả → mở rộng bỏ vải, chỉ giữ loại SP

#### 3. Phân loại SP cần vải vs không cần vải

```text
CẦN VẢI: ga chun, ga phủ, chăn hè, vỏ chăn, vỏ chăn chần, vỏ gối
KHÔNG CẦN VẢI: bảo vệ nệm, khăn, tấm trang trí, gối trang trí, ruột chăn, ruột gối, topper, đệm, váy giường, áo choàng, rèm
```

#### 4. Cập nhật prompt — Thêm danh sách segments đã parse

Truyền segments đã parse vào prompt để AI biết chính xác có bao nhiêu SP, vải gì:
```
## YÊU CẦU ĐÃ PHÂN TÍCH (${segments.length} sản phẩm):
1. Ga chun T300 sọc 150x200x10cm
2. Vỏ chăn T250 trơn 200x220
...
Mỗi dòng trên PHẢI có 1 item tương ứng trong kết quả.
```

#### 5. Validation sau AI — Đảm bảo đủ dòng

So sánh `items.length` với `segments.length`. Nếu thiếu → ghi warning vào response.

### Ví dụ hoạt động

Input đơn giản: `Chan he tran hai mat 2.0 x 2.2  ga chun 1.6 x 2.0 x 14p t250 trang`

```text
Parse:
  - "chan he" detected → type=chăn hè, cần vải
  - "tran" → pattern=trơn (tạm gán)
  - "hai mat" → note
  - "2.0 x 2.2" → size
  - "ga chun" detected → type=ga chun, cần vải
  - "1.6 x 2.0 x 14p" → size
  - "t250" → material=T250
  - "trang" → pattern=trơn

Gán vải (chỉ có T250 trơn trong request):
  Segment 1: chăn hè, T250, trơn, 200x220
  Segment 2: ga chun, T250, trơn, 160x200x14cm

Filter DB:
  - category ILIKE '%chăn hè%T250%trơn%' → ~8 SP
  - category ILIKE '%ga chun%T250%trơn%' → ~70 SP
  Total: ~78 SP (thay vì 917)
```

### Phạm vi sửa

**File duy nhất**: `supabase/functions/lookup-tax-code/index.ts`

1. Thêm `parseRequestSegments()` — parser tách cụm SP + gán vải
2. Sửa `extractCategoryFilters()` → nhận segments thay vì raw text
3. Sửa `filterProductsByCategory()` → lọc theo từng segment + union
4. Sửa phần AI prompt → inject danh sách segments đã parse
5. Thêm validation đếm items vs segments

