

## Cho phép điều chỉnh điều khoản tự do trong Hợp đồng Nguyên tắc

### Hiện tại
- 6 điều khoản cố định, chỉ sửa được nội dung (content), không sửa được tiêu đề, không thêm/xóa/đổi thứ tự

### Nâng cấp

**File**: `src/components/CreateFrameworkContractForm.tsx`

1. **Sửa tiêu đề điều khoản** — Thay Label tĩnh bằng Input, cho phép đổi tên điều (ví dụ: "ĐIỀU 1: PHẠM VI HỢP TÁC" → "ĐIỀU 1: SẢN PHẨM")

2. **Thêm điều khoản mới** — Nút "Thêm điều khoản" ở cuối danh sách, tự động đánh số "ĐIỀU N:"

3. **Xóa điều khoản** — Nút xóa (icon Trash) trên mỗi điều, có xác nhận nếu nội dung không rỗng

4. **Đổi thứ tự** — Nút mũi tên lên/xuống (ArrowUp/ArrowDown) để di chuyển điều khoản, tự động cập nhật lại số thứ tự "ĐIỀU 1, 2, 3..."

5. **Khôi phục mặc định** — Nút "Khôi phục mặc định" để reset về 6 điều khoản gốc

6. **Cập nhật summary** — Hiển thị số điều khoản động: "Chỉnh sửa nội dung các điều khoản (N điều)"

