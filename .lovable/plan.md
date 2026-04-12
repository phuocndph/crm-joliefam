

## Dọn dẹp cột Ghi chú

### Vấn đề phát hiện
Không có lỗi compile hay runtime. Tuy nhiên có 2 vấn đề nhỏ cần sửa:

1. **Dead code**: Hàm `formatNotes` (dòng 434-448) được định nghĩa nhưng không bao giờ được sử dụng — nên xóa bỏ để code sạch hơn
2. **Cột hoạt động bình thường**: truncate + tooltip + sticky đều đang chạy đúng

### Thay đổi

**File: `src/components/InlineOrderEditTable.tsx`**

- Xóa hàm `formatNotes` không sử dụng (dòng 434-448) trong case `"notes"`
- Giữ nguyên logic hiển thị hiện tại (truncate, auto-note filter, tooltip)

