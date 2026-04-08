

## Sửa lỗi AI bịa UUID — Validate và tìm SP gần nhất

### Vấn đề
AI đôi khi trả `matchedProductId` là UUID không tồn tại trong bảng giá (bịa). Khi đó:
- `originalProduct` = undefined → SKU trống
- Giá có thể sai
- Ảnh hưởng tính lợi nhuận vì không link được SP gốc

### Giải pháp: Server-side validation + auto-fix

**File**: `supabase/functions/lookup-tax-code/index.ts`

#### 1. Sau khi AI trả kết quả (dòng 975-988), thêm bước validate + sửa

Với mỗi item AI trả về:
1. Kiểm tra `matchedProductId` có tồn tại trong `filteredProducts` không
2. Nếu **KHÔNG** tồn tại → tìm SP gần nhất bằng cách:
   - So khớp `customName` với tên SP trong catalog (fuzzy match đơn giản: normalize text, tính số từ khóa trùng)
   - Ưu tiên SP cùng loại + kích thước LỚN HƠN gần nhất
   - Gán lại `matchedProductId` = UUID thật, `price` = giá SP thật
   - Thêm note: "SP gốc không tìm thấy chính xác, đã match với [tên SP thật]"
3. Nếu **CÓ** tồn tại → giữ nguyên

#### 2. Hàm `findClosestProduct(itemName, allProducts)`

Logic match:
- Normalize cả 2 string (lowercase, bỏ dấu)
- Tách từ khóa chính: loại SP (thảm, ga, chăn...), kích thước, chất liệu
- Tính điểm: loại SP trùng (+10), chất liệu trùng (+5), kích thước gần nhất (+3)
- Trả SP có điểm cao nhất

VD: AI bịa "Thảm chân 45x70x360g dệt logo" → tìm trong catalog → match "Thảm chân 50x80x330g dệt logo" (cùng loại, size gần nhất)

#### 3. Cập nhật prompt thêm nhấn mạnh

Thêm vào dòng 940: "Nếu không tìm thấy SP đúng kích thước, PHẢI chọn SP kích thước LỚN HƠN gần nhất từ bảng giá, KHÔNG ĐƯỢC tự tạo UUID mới."

### Kết quả
- Mọi `matchedProductId` trong output đều là UUID thật từ DB
- SKU, giá, link SP luôn chính xác
- Người dùng click vào mã SP sẽ thấy đúng SP gốc trong bảng giá
- Lợi nhuận tính đúng vì có `originalProductId` thật

### Phạm vi sửa
- **File duy nhất**: `supabase/functions/lookup-tax-code/index.ts`
  1. Thêm hàm `findClosestProduct()`
  2. Thêm bước validate + auto-fix sau dòng 988
  3. Bổ sung prompt nhấn mạnh không bịa UUID

