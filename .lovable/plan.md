

## Tự động chọn Shop theo cân nặng

### Vấn đề
Hiện tại shop được chọn mặc định là shop đầu tiên trong danh sách. Người dùng muốn hệ thống tự động chọn shop phù hợp dựa trên cân nặng thực tế hoặc cân nặng quy đổi (lấy giá trị lớn hơn).

### Cách tính cân nặng quy đổi GHN
```text
Cân nặng quy đổi (g) = Dài(cm) × Rộng(cm) × Cao(cm) / 6000 × 1000
Cân nặng tính cước = MAX(cân nặng thực, cân nặng quy đổi)
```

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Thêm hàm parse tên shop để trích xuất khoảng cân nặng**
   - Parse tên shop (ví dụ "đơn hàng từ 20kg trở lên" → min=20, max=Infinity)
   - Các pattern: "10-19kg", "từ 20kg trở lên", "dưới 5kg", v.v.

2. **Thêm hàm tính cân nặng quy đổi**
   - `convertedWeight = length * width * height / 6000` (kg)
   - `effectiveWeight = Math.max(weight/1000, convertedWeight)` (kg)

3. **Thêm useEffect tự động chọn shop khi weight/length/width/height thay đổi**
   - Tính `effectiveWeight` (kg)
   - Duyệt danh sách shops, tìm shop có khoảng cân phù hợp
   - Gọi `setSelectedShopId(...)` nếu tìm được shop khớp

4. **Hiển thị cân nặng quy đổi trong UI** (tùy chọn)
   - Thêm dòng nhỏ bên dưới phần kích thước hiển thị: "KL quy đổi: 12kg → Shop: 10-19kg"

### Ví dụ
- Đơn 9kg thực tế, kích thước quy đổi ra 12kg → chọn shop "10-19kg"  
- Đơn 25kg thực tế, kích thước quy đổi ra 15kg → chọn shop "từ 20kg trở lên"

