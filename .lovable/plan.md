
# Đánh giá và cải thiện UI trang Quản lý vải - Kho Hà Nội

## ✅ Đã hoàn thành

### 1. Thu gọn sections với Collapsible
- ✅ `FabricTransactionsTable.tsx`: Bọc trong Collapsible, mặc định thu gọn, hiển thị count
- ✅ `FabricUsageDetails.tsx`: Bọc trong Collapsible, mặc định thu gọn

### 2. Cải thiện bảng "Chi tiết sử dụng vải"
- ✅ Gộp cột "Loại đơn hàng" + "Loại đơn" thành 1 cột "Loại"
- ✅ Thêm sticky header cho bảng
- ✅ Chuyển "Ghi chú" thành tooltip (icon bong bóng chat)
- ✅ Giảm padding với compact mode (py-2, text-sm)
- ✅ Số lượng hiển thị màu đỏ (xuất kho)

### 3. Bộ lọc gọn gàng hơn
- ✅ Đặt bộ lọc trong Collapsible mặc định thu gọn
- ✅ Hiển thị badge "X bộ lọc" khi có filter active
- ✅ Nút xóa bộ lọc đổi màu destructive khi có filter

### 4. Nút thao tác nổi bật hơn
- ✅ Nút "Ghi nhận sử dụng vải" dùng size="lg" và shadow

### 5. Cải thiện hiển thị số liệu
- ✅ Số lượng vải dùng màu destructive để phân biệt xuất kho
- ✅ Badge compact hơn với text-xs

---

## Kết quả

| Trước | Sau |
|-------|-----|
| Trang dài, phải cuộn nhiều | Compact, sections thu gọn mặc định |
| Bảng khó đọc với 9 cột | Bảng gọn gàng 7 cột, ghi chú tooltip |
| Bộ lọc chiếm nhiều chỗ | Bộ lọc thu gọn, có badge khi active |
| Header bị mất khi cuộn | Sticky header giữ cố định |
| Khó tìm nút thao tác | Nút lớn hơn, nổi bật hơn |
