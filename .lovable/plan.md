

## Ẩn nút "Thêm thanh toán" khi đơn đã thanh toán đủ + cập nhật nhanh hơn

### Thay đổi trong `src/pages/OrderManagement.tsx`

**1. Ẩn nút "Thêm thanh toán" khi còn lại = 0** (dòng 729-732)
- Wrap nút trong điều kiện: chỉ hiện khi `calculateRemainingAmount(selectedOrder) > 0`

**2. Cập nhật dữ liệu nhanh hơn sau thanh toán** (dòng 291-302)
- Trong `handlePaymentAdded`: sau khi `loadOrders()`, cập nhật lại `selectedOrder` từ data mới để dialog chi tiết hiển thị số liệu đúng ngay lập tức
- Gọi `queryClient.invalidateQueries({ queryKey: ['orders'] })` trực tiếp để trigger refetch ngay

### Thay đổi trong `src/components/InlineOrderEditTable.tsx`
- Tương tự, nếu có nút thanh toán trong bảng inline, ẩn khi đã thanh toán đủ

