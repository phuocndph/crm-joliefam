

## Fix logic thông tin sản phẩm theo đúng chuẩn GHN API

### Vấn đề phát hiện

1. **Công thức KL quy đổi sai**: Code hiện tại dùng `(L×W×H)/6000*1000` nhưng GHN API docs ghi rõ: `(L×W×H)/5` (kết quả tính bằng gram). Ví dụ: 50×40×20 = 40000/5 = 8000g (đúng) vs 40000/6000*1000 = 6667g (sai).

2. **Thiếu trường `code` và `price` trong items**: GHN API hỗ trợ thêm `code` (mã SP) và `price` (giá SP) cho mỗi item. Không bắt buộc nhưng nên truyền để GHN quản lý tốt hơn.

3. **Hàng nặng vs Hàng nhẹ**: Khi `service_type_id = 5` (hàng nặng), GHN tính cước từ `items[]` chứ không phải từ level đơn hàng. Mỗi item = 1 kiện hàng. Công thức: `Max(length), Max(width), Sum(height)`. Hiện code chưa phân biệt rõ 2 chế độ này.

4. **Weight mặc định 200g quá thấp** cho chăn ga gối — nên tăng lên 1000g.

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Sửa công thức KL quy đổi** từ `(L*W*H)/6000*1000` thành `(L*W*H)/5` đúng theo GHN docs.

2. **Tăng weight mặc định** từ 200g lên 1000g cho phù hợp với sản phẩm chăn ga gối.

3. **Thêm hiển thị chế độ hàng nặng**: Khi `service_type_id = 5`, hiển thị thông báo cho user biết GHN sẽ tính cước từ items (mỗi item = 1 kiện hàng), và tự tính tổng hiển thị: `Max(length), Max(width), Sum(height), Sum(weight)`.

4. **Truyền thêm `price`** cho mỗi item khi gọi API (lấy từ insurance_value chia đều hoặc 0).

5. **Cập nhật pre-fill weight** từ 200g → 1000g.

### Chi tiết kỹ thuật

```text
Hiện tại:  dimensionalWeightGram = Math.round((length * width * height) / 6000 * 1000)
Sửa thành: dimensionalWeightGram = Math.round((length * width * height) / 5)

Default weight: 200 → 1000

items payload: thêm price: 0 (optional)

Khi service_type_id = 5 (hàng nặng):
  - Hiển thị note: "Hàng nặng: GHN tính cước từ kích thước mỗi kiện hàng"
  - Auto-calc tổng: Max(items.length), Max(items.width), Sum(items.height), Sum(items.weight)
```

