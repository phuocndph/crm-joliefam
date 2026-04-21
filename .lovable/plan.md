

## Khôi phục đúng quy tắc GHN (rollback vi phạm)

Tôi đã sai khi tách item ra và tự thêm số lượng — vi phạm memory rule #4 đã chốt: **"tất cả sản phẩm được gộp thành một dòng duy nhất (dấu ' - ' phân cách). Số lượng mặc định là 1"**.

### Khôi phục về đúng quy tắc

**1. `CreateGHNOrderDialog.tsx` (line 322-333) — gộp lại 1 kiện duy nhất**
- Bỏ `parsedItems.map(...)` tạo nhiều dòng
- Quay về logic cũ: build 1 productItem duy nhất với:
  - `name`: tên các sản phẩm gốc nối bằng ` - `
  - `weight`: TỔNG weight thực tế các item (không phải 1000g/item, tính từ items gốc, fallback 1000g/item nếu thiếu)
  - `quantity`: **luôn = 1** (không cộng dồn)
  - `length/width/height`: mặc định **10/10/10** (user tự chỉnh)

**2. `EditGHNOrderDialog.tsx` (line 193-201) — gộp lại 1 kiện duy nhất**
- Cùng logic như Create: gộp tất cả `raw.items` thành 1 dòng `name` nối ` - `, `quantity: 1`, weight tổng.

**3. Hàng nặng (≥20kg / Service 5) — giữ đúng memory rule #5**
- Chỉ 1 productItem nên `effectiveDims` = chính dims của kiện đó (không còn Max/Sum nhiều item).
- `calculate_fee` và `create_order` gửi `items[]` chứa duy nhất 1 phần tử = đúng package dim.
- Vẫn giữ auto-pick Service 5 khi `isOverweight` (đây là sửa hợp lệ, không vi phạm).

**4. Bỏ cảnh báo "đơn nặng đang dùng dim placeholder"** đã thêm sai context — vì giờ chỉ có 1 kiện gộp, user nhập dim cho kiện đó là chuẩn.

### Phạm vi
- `src/components/CreateGHNOrderDialog.tsx` — rollback prefill về 1-dòng-gộp
- `src/components/EditGHNOrderDialog.tsx` — rollback prefill về 1-dòng-gộp

### Giữ nguyên (các fix hợp lệ trước đó)
- Truyền `service_id`, `from_district_id`, `cod_failed_amount` vào `calculate_fee` ✓
- Auto-pick Service 5 khi đơn nặng ✓
- Default L/W/H = 10cm, quantity = 1 ✓
- Parse `order.items` an toàn (string/array) ✓

### Kết quả
Quay lại đúng nguyên tắc đã chốt: 1 đơn = 1 kiện gộp, SL = 1, user tự nhập kích thước thật cho kiện đó. Không còn tự ý tách item hoặc cộng dồn quantity.

