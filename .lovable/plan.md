

## Lỗi: `ReferenceError: hasImage is not defined`

### Nguyên nhân
Khi tách OCR thành bước riêng, biến `hasImage` bị xóa khai báo nhưng vẫn còn 2 chỗ tham chiếu:

1. **Line 1624**: `hasImage ? 'text' : undefined` — dùng trong `callAI` stepHint
2. **Line 1650**: `if (hasImage && step1Start)` — dùng để thêm pipeline metadata

Cả 2 đều crash vì `hasImage` không tồn tại.

### Sửa

**File: `supabase/functions/lookup-tax-code/index.ts`**

1. **Line 1624**: Thay `hasImage ? 'text' : undefined` → `'text'` (vì giờ luồng này chỉ xử lý text thuần, luôn là step text)

2. **Line 1650**: Xóa block `if (hasImage && step1Start)` hoặc đổi thành `if (false)` — vì pipeline metadata chỉ có ý nghĩa khi chạy 2 bước liên tục, nhưng giờ OCR đã tách riêng nên không còn `step1Start` trong luồng này.

### Tóm tắt
- Sửa 2 dòng trong edge function
- Deploy lại
- Không thay đổi logic, chỉ xóa tham chiếu đến biến đã bị xóa

