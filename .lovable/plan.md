

## Thu gọn cột Ghi chú còn ~3cm (~110px)

### Thay đổi trong `src/components/InlineOrderEditTable.tsx`

1. **Header** (dòng 472): giảm `min-w-[140px]` → `min-w-[110px]`
2. **Cell** (dòng 564): giảm `min-w-[140px]` → `min-w-[110px]`
3. **Nội dung** (dòng 452): thêm `truncate max-w-[90px]` + `title` tooltip để hover xem đầy đủ, bỏ `whitespace-pre-wrap break-words`
4. Khi click vào vẫn mở inline edit bình thường để sửa đầy đủ

