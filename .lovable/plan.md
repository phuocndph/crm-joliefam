

## Điều chỉnh thông tin sản phẩm theo logic GHN: ẩn/hiện kích thước theo trọng lượng

### Vấn đề
Hiện tại, mỗi sản phẩm luôn hiển thị 4 trường: KL, Dài, Rộng, Cao. Nhưng theo GHN:
- **Đơn nhỏ hơn 20kg**: Không cần điền kích thước từng sản phẩm (chỉ cần KL và số lượng)
- **Đơn lớn hơn 20kg**: Tự động chuyển sang hàng nặng, cần điền Dài/Rộng/Cao từng kiện

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Tính tổng KL realtime** từ `productItems` để xác định ngưỡng 20kg:
   ```
   const totalWeightKg = totalItemWeight / 1000;
   const isOverweight = totalWeightKg >= 20;
   ```

2. **Ẩn cột Dài/Rộng/Cao** trong phần sản phẩm khi tổng KL < 20kg:
   - Chỉ hiện: Tên SP, Số lượng, KL (gram) — layout `grid-cols-3`
   - Khi >= 20kg: hiện thêm Dài, Rộng, Cao — layout 2 hàng như hiện tại

3. **Hiển thị thông báo** khi tổng KL vượt 20kg: "Tổng KL >= 20kg → Hàng nặng. Vui lòng điền kích thước từng kiện."

4. **Giữ nguyên giá trị mặc định** cho length/width/height (30/20/10) để khi chuyển sang hàng nặng, user không phải nhập từ đầu.

5. **Phần "Thông tin đơn hàng"** (weight/length/width/height tổng): cũng ẩn Dài/Rộng/Cao khi < 20kg, chỉ hiện KL.

### Chi tiết kỹ thuật

- Dùng `isOverweight` (totalItemWeight >= 20000) để toggle hiển thị
- Product item UI: conditional render hàng 2 (grid-cols-4 với Dài/Rộng/Cao) chỉ khi `isOverweight`
- Khi không phải hàng nặng, vẫn gửi length/width/height mặc định trong payload (GHN chấp nhận)

