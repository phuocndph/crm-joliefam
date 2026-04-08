

## Sửa 5 lỗi parser khiến T300 bị gán sai thành T250

### Phân tích từ logs

Sản phẩm "Ga chun T300 trắng sọc 160x200x12cm" **CÓ TỒN TẠI** trong DB (giá 245k, 250k). Vấn đề không phải thiếu SP, mà parser gán sai material.

Logs cho thấy:
```text
Segments parsed:
1. vỏ chăn    T250 sọc 200x220     qty=1  ← qty SAI (phải 4)
2. ga chun    T250 sọc 160x200x12  qty=1  ← qty SAI (phải 4)
3. vỏ gối     T250 sọc 45x65       qty=1  ← qty SAI (phải 8)
4. chăn hè    T250 sọc ""          qty=1  ← size TRỐNG
5. chăn       T300 sọc 200x220     qty=1  ← PHANTOM (từ "chần" bị parse thành "chăn")
6. ga chun    T250 sọc 160x200x12  qty=1  ← T250 SAI (phải T300)
7. ga chun    T250 sọc 160x200x15  qty=1  ← T250 SAI (phải T300)
```

→ Ga chun T300 bị gán T250 → filter chỉ tìm T250 → auto-fix báo "T300 không có" → **SAI HOÀN TOÀN**

### 5 lỗi cần sửa (cùng plan đã duyệt trước đó)

**Lỗi 1 — Quantity "4c" không parse được**
Regex hiện tại không nhận "4c", "8c". Thêm pattern `/(\d+)\s*c\b/i` và mở rộng chunk scan lấy text TRƯỚC keyword.

**Lỗi 2 — "chăn hè chần" tạo phantom "chăn"**  
"chan he chan 200x220" → "chan he" match + "chan" (từ chữ "chần") match thêm → phantom segment.
Thêm keyword `/\bchan\s*he\s*chan/i` → "chăn hè chần" (ưu tiên trước "chăn hè").

**Lỗi 3 — Section context sai do `norm.indexOf()`**  
2 "ga chun" trùng rawText → `indexOf` luôn trả vị trí đầu tiên (section 1/T250).
Lưu `_pos: found[i].idx` vào segment, dùng position thật thay vì indexOf.

**Lỗi 4 — "chăn hè chần 200x220" mất size**  
Size "200x220" rơi sang phantom "chăn" do chunk bị cắt sai. Fix theo lỗi 2.

**Lỗi 5 — Quantity trước keyword bị mất**  
"4c Vỏ chăn" → "4c" nằm TRƯỚC keyword → ngoài chunk. Mở rộng chunk từ end segment trước.

### Thay đổi cụ thể

**File duy nhất**: `supabase/functions/lookup-tax-code/index.ts`

1. **Thêm keyword** `chan he chan` (chăn hè chần) trước `chan he` trong `PRODUCT_KEYWORDS`
2. **Sửa quantity regex** (dòng 349): thêm `/(\d+)\s*c\b/i`
3. **Mở rộng chunk** (dòng 317-320): lấy từ end of previous segment thay vì start of current keyword
4. **Lưu position** vào segment: thêm `_pos` field, dùng thay `norm.indexOf`
5. **Thêm TYPE_TO_CATEGORY** cho `'chăn hè chần': ['chăn hè']`

### Kết quả mong đợi
```text
1. vỏ chăn      T250 sọc 200x220     qty=4  ✓
2. ga chun      T250 sọc 160x200x12  qty=4  ✓
3. vỏ gối       T250 sọc 45x65       qty=8  ✓
4. chăn hè chần T250 sọc 200x220     qty=1  ✓
5. ga chun      T300 sọc 160x200x12  qty=1  ✓
6. ga chun      T300 sọc 160x200x15  qty=1  ✓
```

Ga chun T300 sẽ match đúng SP trong DB (245k, 250k) — không còn báo "không có trong bảng giá".

