
## Cập nhật giá trị mặc định sản phẩm GHN

**Thay đổi:** `src/components/CreateGHNOrderDialog.tsx`

1. **Khi có items từ đơn hàng (line 309-316):**
   - `quantity`: từ `Math.max(1, totalQty)` → `1`
   - `length`: từ `30` → `10`
   - `width`: từ `20` → `10`
   - `height`: từ `10` → `10` (giữ nguyên)

2. **Khi không có items (line 319):**
   - `length`: từ `30` → `10`
   - `width`: từ `20` → `10`
   - `height`: từ `10` → `10` (giữ nguyên)

**Kết quả:** Dài/Rộng/Cao mặc định 10cm, Số lượng mặc định 1.
