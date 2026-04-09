

## Sửa logic "Đã giao" để bao gồm cả "Đã giao tự thu tiền"

### Nguyên nhân
Code hiện tại chỉ kiểm tra `status === "delivered"`, nhưng thực tế có 2 trạng thái giao hàng:
- `shipped` = "Đã giao"
- `self_delivered` = "Đã giao tự thu tiền"

### Thay đổi trong `src/components/InlineOrderEditTable.tsx`

1. **Dòng 233**: Sửa điều kiện auto-set `delivered_date`:
   - `valueToSave === "delivered"` → `valueToSave === "shipped" || valueToSave === "self_delivered"`

2. **Dòng 396**: Sửa điều kiện hiển thị ngày giao:
   - `order.status === "delivered"` → `order.status === "shipped" || order.status === "self_delivered"`

3. **Dòng 401**: Hiển thị nhãn phù hợp theo trạng thái:
   - `shipped` → "Đã giao"
   - `self_delivered` → "Đã giao tự thu tiền"

