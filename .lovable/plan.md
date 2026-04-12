

## Sửa cột Ghi chú: wrap text thay vì truncate

### Vấn đề
Cột Ghi chú đang dùng `truncate` nên text bị cắt và che lên thanh tab khi cuộn. Cần cho text tự xuống dòng để nhìn thấy toàn bộ nội dung.

### Thay đổi trong `src/components/InlineOrderEditTable.tsx`

**1. Nội dung ghi chú (dòng 436-440):** Bỏ `truncate max-w-[90px]`, thay bằng `whitespace-pre-wrap break-words` để text tự xuống dòng. Bỏ `title` tooltip (không cần nữa vì đã hiện đầy đủ).

**2. Giữ nguyên** width cột `min-w-[110px]` và sticky positioning.

