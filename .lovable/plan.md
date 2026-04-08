

## Khi click vào mã SP → mở dialog và tự động tìm đúng sản phẩm đó

### Vấn đề
Hiện tại click vào nút mã SP (VD: "CHT250-200-T") mở dialog chọn sản phẩm nhưng ô tìm kiếm trống — phải tự gõ lại để tìm. Cần tự động điền mã SP vào ô tìm kiếm để trỏ ngay đến đúng sản phẩm.

### Giải pháp

**File**: `src/components/CreateQuoteForm.tsx`

Tại dòng ~1490, khi click nút:
1. Ngoài `setCurrentEditingIndex(index)`, thêm `setSearchTerm(item.sku || item.name || '')` để tự động điền mã SP/tên SP vào ô tìm kiếm
2. Dialog mở ra sẽ hiển thị ngay sản phẩm đang chọn, người dùng thấy được thông tin chi tiết để xác nhận đúng/sai

### Kết quả
- Click "CHT250-200-T" → dialog mở với ô search đã điền "CHT250-200-T" → hiển thị đúng sản phẩm đó ngay lập tức

