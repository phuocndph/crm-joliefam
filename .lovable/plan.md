

## Fix: Thông tin đơn hàng luôn hiện đầy đủ Dài/Rộng/Cao

### Vấn đề
Hiện tại phần "Thông tin đơn hàng" ẩn các trường Dài, Rộng, Cao khi tổng KL < 20kg (do điều kiện `isOverweight`). User muốn phần này luôn hiện đầy đủ.

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Bỏ điều kiện `isOverweight`** ở phần "Thông tin đơn hàng" (line 1097-1117):
   - Grid luôn dùng `grid-cols-5`
   - Bỏ `{isOverweight && (...)}` wrapper quanh Dài/Rộng/Cao → luôn hiển thị

Chỉ giữ logic ẩn/hiện kích thước ở phần **sản phẩm** (mỗi item) — phần "Thông tin đơn hàng" luôn đầy đủ.

