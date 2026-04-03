## Mở báo giá phụ khi click đơn hàng trong bảng lợi nhuận

### Mô tả
Khi click vào một dòng đơn hàng trong tab "Lợi nhuận" của trang Quản lý dòng tiền, hệ thống sẽ tìm báo giá (quote) liên kết với đơn hàng đó (qua field `quote_id` trên bảng orders) và mở `QuoteSupplementDialog` để xem chi tiết báo giá phụ.

### Thay đổi

**File: `src/pages/CashFlowManagement.tsx`**

1. Import `QuoteSupplementDialog` từ `@/components/QuoteSupplementDialog`
2. Thêm state `selectedProfitOrder` để lưu quote data khi click
3. Thêm hàm `handleOrderClick(orderId)`:
   - Tìm order trong danh sách `orders` để lấy `quote_id`
   - Nếu có `quote_id`: fetch quote từ Supabase (kèm customers, assignees) → mở `QuoteSupplementDialog`
   - Nếu không có `quote_id`: hiện toast thông báo "Đơn hàng này chưa có báo giá liên kết"
4. Thêm `onClick` handler vào `TableRow` trong bảng `orderProfits` để gọi `handleOrderClick`
5. Render `QuoteSupplementDialog` ở cuối component

### Luồng xử lý

```text
Click dòng đơn hàng → Lấy order.quote_id
  ├─ Có quote_id → Fetch quote data → Mở QuoteSupplementDialog
  └─ Không có quote_id → Toast "Chưa có báo giá liên kết"
```

### Không thay đổi
- `QuoteSupplementDialog` giữ nguyên
- Logic tính lợi nhuận giữ nguyên
- Các tab khác không ảnh hưởng