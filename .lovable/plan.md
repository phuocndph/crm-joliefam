

## Fix: Số lượng sản phẩm mặc định là 1

### Vấn đề
Khi pre-fill từ đơn hàng, `quantity` được gán bằng `totalQty` (tổng số lượng từ đơn), thay vì mặc định là 1.

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**, line 307:
- Đổi `quantity: totalQty` → `quantity: 1`

Chỉ 1 dòng thay đổi. User tự điều chỉnh số lượng nếu cần.

