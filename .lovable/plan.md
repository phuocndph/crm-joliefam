

## Còn 3 vấn đề tồn đọng

### 1. Mismatch còn sót: `GYKTLTF9` link sai sang đơn 2601 (đáng ra là 2600)
- `internal_order_code='2600'` nhưng **không có đơn 2600** trong DB nữa (có thể đã bị xoá/đổi số).
- Đang link sai sang đơn 2601 từ trước khi migration chạy. Fix 4 không bắt được vì khi check `match_count=0` (không có đơn 2600) → không update.
- **Hành động**: Set `order_id = NULL` cho record này (vì không tìm được đơn đúng), để user gán thủ công.

### 2. 4 record có đủ điều kiện link nhưng vẫn `NULL`
- `GYC4L4DE → 2161`, `GYC4LTBX → 2162`, `GYUH4DWT → 2084`, `GYVF7APP → 2084`
- Cả 4 đều có **đúng 1 đơn match** nhưng `order_id` vẫn `NULL` (Fix 4 trước có thể bỏ sót do điều kiện `OR` lồng nhau).
- **Hành động**: Re-run cleanup đơn giản hơn cho các record `order_id IS NULL`.

### 3. Duplicate `display_order_number = 2248` (Fix 5 trong plan trước chưa xử lý)
- 2 đơn khác khách hàng cùng số `2248`:
  - `ORD-1761796292919` — KH `9a9b64c5...` — 5,250,000đ
  - `ORD-1761967106633` — KH `6d1888bc...` — 6,900,000đ
- Hiện không có mã GHN nào dùng số `2248` → tạm thời an toàn. Nhưng nếu sau này có mã GHN `_2248p` thì trigger sẽ KHÔNG link (vì `count=2`) → user phải gán tay.
- **Hành động**: Tạo cảnh báo UI ở trang đơn hàng khi phát hiện duplicate, hoặc để user tự sửa số đơn 1 trong 2.

### Giải pháp

**Migration mới** (`fix_remaining_ghn_links.sql`):

```sql
-- Sửa GYKTLTF9: clear link sai (không có đơn 2600 để link đến)
UPDATE ghn_tracking 
SET order_id = NULL 
WHERE ghn_order_code = 'GYKTLTF9' 
  AND order_id = '39ed0bcf-8d29-4b2e-83f3-36e17c910f71';

-- Re-link 4 record bị bỏ sót: chỉ xét NULL, exact 1 match
UPDATE ghn_tracking gt
SET order_id = (
  SELECT o.id FROM orders o 
  WHERE o.display_order_number = gt.internal_order_code 
  LIMIT 1
)
WHERE gt.order_id IS NULL
  AND gt.internal_order_code ~ '^[0-9]+$'
  AND (SELECT COUNT(*) FROM orders WHERE display_order_number = gt.internal_order_code) = 1;
```

**UI cảnh báo duplicate** (`src/pages/OrderManagement.tsx`):
- Thêm banner cảnh báo nhỏ ở đầu trang khi `useOrders` phát hiện 2+ đơn có cùng `display_order_number`. Hiển thị danh sách đơn trùng để user sửa.

### Phạm vi
- 1 migration (sửa data còn sót)
- `src/pages/OrderManagement.tsx` (banner cảnh báo duplicate)

