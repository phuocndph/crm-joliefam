

## Fix: KL đơn hàng luôn đồng bộ từ sản phẩm, không cho sửa tay

### Vấn đề
Ô KL (gram) ở "Thông tin đơn hàng" có thể bị nhảy linh tinh vì cơ chế `weightManualOverride` — khi user vô tình click vào ô weight, override bật lên và weight ngừng đồng bộ từ sản phẩm.

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Bỏ `weightManualOverride`** — KL đơn hàng luôn = `totalItemWeight` (tổng KL × SL từ sản phẩm)
2. **Đổi ô KL thành read-only** — hiển thị `totalItemWeight`, không cho sửa tay. User muốn thay đổi KL thì sửa ở từng sản phẩm.
3. **Cập nhật payload và tính toán** dùng `totalItemWeight` trực tiếp thay vì `displayWeight`.

Kết quả: KL đơn hàng luôn khớp chính xác với tổng KL sản phẩm, không bao giờ nhảy linh tinh.

