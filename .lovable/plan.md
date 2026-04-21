

## Sửa default L/W/H về 10cm cho Thông tin sản phẩm và Đơn hàng

Còn 2 chỗ vẫn để default 30/20, cần sửa về 10:

### 1. `src/components/CreateGHNOrderDialog.tsx`
- **Line 181-183** (state khởi tạo `productItems`): `length: 30, width: 20` → `length: 10, width: 10`
- **Line 185-187** (`addProductItem` — khi user bấm "Thêm sản phẩm"): `length: 30, width: 20` → `length: 10, width: 10`

### 2. `src/components/EditGHNOrderDialog.tsx`
- **Line 70-71** (state package L/W): `useState(30)` → `useState(10)`, `useState(20)` → `useState(10)`

### Không đụng vào
- Toàn bộ logic prefill, fee calc, payload, service selection, weight (giữ nguyên 1000g default đã đúng).

