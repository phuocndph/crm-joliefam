

## Xuống dòng nội dung khi in phiếu GHN

### Vấn đề
Hiện tại tất cả sản phẩm được gộp thành 1 dòng duy nhất ngăn cách bởi ` - ` (ví dụ: "Ga chun ks T225 - Vỏ gối màu trắng 50x70 - ..."). Khi in phiếu, nội dung hiển thị dài trên 1 dòng, khó đọc.

### Giải pháp
Thay separator ` - ` bằng `\n` (xuống dòng) khi gộp tên sản phẩm. GHN API hỗ trợ ký tự newline trong trường `content`.

### Thay đổi

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Line 204** - Thay `join(' - ')` bằng `join('\n')` để mỗi sản phẩm nằm trên 1 dòng riêng
2. **Line 118** - Thay `join(", ")` bằng `join('\n')` cho `itemContent` gửi lên API

**File: `src/components/EditGHNOrderDialog.tsx`**

3. **Line 100** - Tương tự, thay `join(", ")` bằng `join('\n')`

