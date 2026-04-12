

## Thu gọn cột Ghi chú

### Thay đổi trong `src/components/InlineOrderEditTable.tsx`

1. **Giảm min-width** từ `220px` xuống `140px` (cả header dòng 470 và cell dòng 562)
2. **Thêm truncate** cho nội dung ghi chú: text bị cắt với `...` khi quá dài, hover để xem tooltip đầy đủ
3. **Giảm right offset** của cột Ghi chú từ `right-[80px]` xuống `right-[60px]` và cột hành động từ `min-w-[80px]` xuống `min-w-[60px]` để tiết kiệm thêm

Kết quả: cột Ghi chú chỉ chiếm ~140px thay vì 220px, nội dung dài sẽ hiển thị truncated với tooltip khi hover.

