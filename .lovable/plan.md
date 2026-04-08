

## Sửa 2 lỗi parser: "trắng sọc" → trơn, và không hiểu section header

### Vấn đề gốc (từ logs)

Input: `Vải T250 trắng sọc: Vỏ chăn 200x220... --- Vải T300 trắng sọc: Ga chun...`

Parser hiện tại trả:
- Tất cả pattern = "trơn" (sai, phải là "sọc")
- "chăn" phantom segment từ "Vải T300 trắng **sọc**" (header bị parse thành SP)
- Ga chun sau "---" nhận T250 thay vì T300

**Lỗi 1**: Regex pattern `/(tron|trang\s*tinh|trang|soc|ke)/` — "trang" match trước "soc" → gán "trơn". Nhưng "trắng sọc" = màu trắng + mẫu sọc, KHÔNG phải trơn.

**Lỗi 2**: Không có logic section header. "Vải T250 trắng sọc:" là header định nghĩa vải cho các SP bên dưới, không phải SP.

### Giải pháp

**File**: `supabase/functions/lookup-tax-code/index.ts`

#### 1. Sửa pattern regex — "trang" đứng trước "soc" thì KHÔNG phải trơn

Thay:
```
/\b(tron|trang\s*tinh|trang|soc|ke)\b/
```
Bằng logic: match "soc/ke" → sọc. Match "tron" hoặc "trang tinh" → trơn. "trang" đứng một mình (không có "soc" theo sau) → trơn. "trang" + "soc" → chỉ lấy "sọc", bỏ "trang".

Áp dụng cho cả global pattern (dòng 218) và local pattern (dòng 256).

#### 2. Thêm logic parse section headers

Trước khi tìm product keywords, quét các dòng dạng:
- `Vải T250 trắng sọc:` hoặc `Vải T300 sọc`
- Dấu phân cách: `---`, `-`, dòng trống

Logic:
1. Tách request theo separator (`---`, `-` đầu dòng)
2. Mỗi section kiểm tra có header "Vải Txxx..." không
3. Nếu có → lưu material + pattern context cho section đó
4. Các SP trong section thừa hưởng material/pattern từ header
5. Header KHÔNG được parse thành SP (loại khỏi product keyword scan)

#### 3. Sửa logic gán material fallback

Thay vì `uniqueMats[0]` cho tất cả, mỗi segment nhận material từ section context của nó:
- SP trong section 1 ("Vải T250 sọc") → T250 sọc
- SP trong section 2 ("Vải T300 sọc") → T300 sọc

### Ví dụ kết quả sau fix

```text
Input: Vải T250 trắng sọc: 4c Vỏ chăn 200x220 ... 1c chăn hè chần 200x220 --- Vải T300 trắng sọc: 1c Ga chun 160x200x12cm

Sections:
  Section 1: context = { material: T250, pattern: sọc }
    → Vỏ chăn: T250 sọc 200x220
    → Ga chun: T250 sọc 160x200x12cm
    → Vỏ gối: T250 (gối không có sọc/trơn trong DB nên chỉ filter T250)
    → Chăn hè chần: T250 sọc 200x220
  Section 2: context = { material: T300, pattern: sọc }
    → Ga chun: T300 sọc 160x200x12cm
    → Ga chun: T300 sọc 160x200x15cm
```

### Phạm vi sửa

**File duy nhất**: `supabase/functions/lookup-tax-code/index.ts`

1. Sửa hàm `parseRequestSegments()`:
   - Thêm bước 0: tách sections theo separator, parse header
   - Sửa pattern regex: "trang" + "soc" = sọc, không phải trơn
   - Loại header text khỏi product keyword scan
   - Gán material/pattern từ section context thay vì global first

