# Tăng tốc cập nhật đơn hàng — Phản hồi tức thì

## Vấn đề

Mỗi khi đổi trạng thái hoặc sửa đơn, UI phải đợi rất lâu vì:

1. `updateOrderStatus` ở `OrderManagement.tsx` gọi `await supabase.update(...)` rồi mới `loadOrders()` → refetch **toàn bộ** đơn hàng (kèm join customers, assignees, ghn_tracking, payments) → mất vài giây.
2. `EditOrderDialog` cũng gọi `await update` → `onSubmit()` → `loadOrders()` toàn bộ.
3. Realtime subscription đã tự invalidate khi DB thay đổi, nên việc `loadOrders()` thủ công là **trùng lặp** và không cần thiết.
4. Toast "Thành công" hiển thị sau khi mạng trả về → cảm giác chậm.

## Giải pháp: Optimistic Update

Cập nhật cache React Query **ngay lập tức** trước khi gọi API. UI đổi tức thì (<50ms). Nếu API lỗi → rollback và báo toast lỗi.

### 1. `src/pages/OrderManagement.tsx` — `updateOrderStatus`

- Dùng `queryClient.setQueryData(['orders-infinite', ...], ...)` để patch ngay record có `id === orderId` với `status` (và `delivered_date` nếu cần).
- Đóng dropdown + hiển thị toast "Đã cập nhật" **ngay** (không await).
- Gọi `supabase.update` ở background. Nếu lỗi → `setQueryData` rollback về giá trị cũ + toast lỗi.
- **Bỏ** `loadOrders()` — realtime sẽ tự đồng bộ phần còn lại.
- Việc tạo `transactions` khi `delivered` vẫn chạy background, không block UI.

### 2. `src/components/EditOrderDialog.tsx`

- Patch cache ngay với `status`, `notes`, `delivery_date` mới.
- Đóng dialog ngay (`onOpenChange(false)`) + toast thành công ngay.
- API call chạy background; nếu lỗi → rollback + toast lỗi.

### 3. Bỏ refetch toàn bộ ở các handler

- `handleEditOrder`, `handleDeleteOrder`: bỏ `loadOrders()`, để realtime + optimistic cache lo. Chỉ gọi `invalidateQueries` mềm (không await) khi thật sự cần.

### 4. Helper

Tạo hàm nhỏ `patchOrderInCache(queryClient, orderId, patch)` để dùng chung cho status update, edit dialog, payment update.

## Phạm vi file

- `src/pages/OrderManagement.tsx` (updateOrderStatus + các handler)
- `src/components/EditOrderDialog.tsx`
- (tùy chọn) `src/hooks/useOrders.ts` thêm helper patch cache

## Kết quả mong đợi

- Đổi trạng thái / sửa đơn: UI cập nhật **dưới 100ms** (tức thì).
- Mạng chạy ngầm; lỗi sẽ tự rollback rõ ràng.
- Không còn cảm giác "đợi load lại bảng".

Bấm **Approve plan** để mình áp dụng.
