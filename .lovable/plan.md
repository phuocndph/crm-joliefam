

## Sửa lỗi parser chỉ tạo 1 section — T300 bị gán nhầm T250

### Nguyên nhân gốc

Từ logs, `parseSectionsFromRequest()` chỉ tạo **1 section** `[T250/sọc, 41-270]` thay vì 2. Toàn bộ 6 segment đều rơi vào section T250.

Regex header hiện tại: `/\bvai\s+(?:t\s*\d{3}|...)\b[^:\n]*(?::|$)/gi`

Lỗi nằm ở đây:
1. **Regex `(?::|$)` quá chặt** — header PHẢI kết thúc bằng `:` hoặc end-of-string. Nếu header kết thúc bằng newline, space, hoặc nằm sau `---` mà không có `:`, regex không match
2. **Comment "Also split by separators" (dòng 477) chưa triển khai** — code chỉ dùng header regex, không hề xử lý `---` hay `-` như separator
3. **`startIdx: 41` bất thường** — cho thấy text trước header có thể chứa ký tự ẩn hoặc format khác từ textarea

### Giải pháp

**File duy nhất**: `supabase/functions/lookup-tax-code/index.ts`

#### 1. Thay đổi `parseSectionsFromRequest()` — Split by separator TRƯỚC, tìm header TRONG mỗi block

```text
Logic mới:
1. Split text theo separator: "---", "\n-\n", hoặc dòng trống kép
2. Với mỗi block, tìm header "vai t250/t300..." 
3. Nếu block có header → tạo section với material/pattern từ header
4. Nếu block KHÔNG có header → kế thừa context từ block trước (hoặc global fallback)
```

Cụ thể:
- Dùng regex `/-{2,}|\n\s*-\s*\n|\n{2,}/g` để split text thành blocks
- Lưu offset thật của mỗi block trong text gốc (để `_pos` mapping vẫn đúng)
- Trong mỗi block, tìm header regex (relaxed: không bắt buộc `:`)
- Header regex mới: `/\bvai\s+(?:t\s*\d{3}|lth|mcr|tencel|tici)\b[^:\n]*/gi` (bỏ `(?::|$)`)

#### 2. Sửa header regex — relaxed ending

Từ: `/\bvai\s+(?:t\s*\d{3}|lth|mcr|tencel|tici)\b[^:\n]*(?::|$)/gi`
Thành: `/\bvai\s+(?:t\s*\d{3}|lth|mcr|tencel|tici)\b[^:\n]*:?/gi`

Hoặc tốt hơn: dùng regex chỉ match phần "vai T___" và scan context xung quanh cho pattern.

#### 3. Cập nhật headerRanges trong `parseRequestSegments()`

Đồng bộ headerRegex2 (dòng 513) với regex mới.

#### 4. Thêm debug log cho normalized text

Thêm `console.log('Normalized text:', norm.substring(0, 200))` để debug dễ hơn.

#### 5. Deploy và test

Test với input gốc: `Vải T250 trắng sọc: 4c Vỏ chăn 200x220, ... --- Vải T300 trắng sọc: 1c Ga chun ...`

### Kết quả mong đợi

```text
Parsed sections: [
  {"material":"T250","pattern":"sọc","startIdx":20,"endIdx":~140},
  {"material":"T300","pattern":"sọc","startIdx":~160,"endIdx":~270}
]

Segments:
1. vỏ chăn     T250 sọc 200x220     qty=4  ✓
2. ga chun     T250 sọc 160x200x12  qty=4  ✓
3. vỏ gối      T250 sọc 45x65       qty=8  ✓
4. chăn hè chần T250 sọc 200x220    qty=1  ✓
5. ga chun     T300 sọc 160x200x12  qty=1  ✓
6. ga chun     T300 sọc 160x200x15  qty=1  ✓
```

