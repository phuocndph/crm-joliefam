

## Cập nhật "Thông tin sản phẩm" theo chuẩn GHN cho đơn hàng nặng

### Vấn đề
Hiện tại mỗi sản phẩm chỉ có 3 trường: Tên, KL (gram), Số lượng. GHN API cho phép truyền thêm `length`, `width`, `height` cho từng item trong mảng `items`. Đối với đơn hàng nặng (>20kg), thông tin kích thước là bắt buộc để tính cước chính xác.

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Mở rộng interface productItems** thêm 3 trường: `length`, `width`, `height` (cm) cho mỗi sản phẩm, với giá trị mặc định hợp lý (30, 20, 10 cm).

2. **Cập nhật UI mỗi sản phẩm** từ 3 cột thành 2 hàng:
   - Hàng 1: Tên sản phẩm (rộng hơn), Số lượng
   - Hàng 2: KL (gram), Dài (cm), Rộng (cm), Cao (cm)

3. **Cập nhật `handleSubmit`** để truyền `length`, `width`, `height` cho mỗi item khi gọi GHN API:
   ```
   items: productItems.map(p => ({
     name: p.name, quantity: p.quantity, weight: p.weight,
     length: p.length, width: p.width, height: p.height
   }))
   ```

4. **Cập nhật pre-fill** để set default dimensions cho items khi load từ đơn hàng.

5. **Auto-sync tổng kích thước**: Khi chỉ có 1 sản phẩm, tự động sync dimensions từ item lên phần "Thông tin đơn hàng" (weight, length, width, height tổng). Khi có nhiều sản phẩm, giữ nguyên cho user tự nhập tổng.

### Chi tiết kỹ thuật
- Interface mới: `{ name: string; weight: number; quantity: number; length: number; width: number; height: number }`
- Default values: `length: 30, width: 20, height: 10`
- Layout: grid `grid-cols-2` cho hàng 1, `grid-cols-4` cho hàng 2

