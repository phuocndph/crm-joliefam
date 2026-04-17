

## Kết quả kiểm tra: Có sai sót thực sự, đã tìm thấy 6+ trường hợp gán nhầm mã GHN cho đơn sai

### Bằng chứng từ DB (sample query 30 records gần nhất)

| Mã GHN | Tên KH chứa | Đang gán cho đơn | Đúng phải là |
|---|---|---|---|
| GYKAEKBF | Hoàng Thị Huyên_**2619**p | đơn **2620** ❌ | đơn 2619 |
| GYKMXLUR | Hạnh Window Hotel_**2602**p | đơn **2603** ❌ | đơn 2602 |
| GYKWPU6T | Ngọc Tây..._**2601**p | đơn **2602** ❌ | đơn 2601 |
| GYKHH3AN | Vang Trang Khuyet_**2611**p | đơn **2612** ❌ | đơn 2611 |
| GYKTLTF9 | Minh Hoà..._**2600**p | đơn **2601** ❌ | đơn 2600 |
| GYK89YK3 | Khách Sạn Bảo Trân..._**2588**p | đơn **2513** ❌ | đơn 2588 |

### 4 nguyên nhân gốc

**Nguyên nhân 1 — Trigger auto-link dùng `LIMIT 1` không có `ORDER BY`** (`auto_link_ghn_tracking_to_order`)
```sql
SELECT id INTO NEW.order_id
FROM public.orders
WHERE display_order_number = NEW.internal_order_code
LIMIT 1;  -- Có 2 đơn cùng số 2248 → random
```
Phát hiện 1 cặp `display_order_number = 2248` trùng nhau → bất kỳ mã GHN nào có internal_code='2248' sẽ được gán random.

**Nguyên nhân 2 — `extractOrderNumber` quá lỏng lẻo** (`ghn-tracking/index.ts` line 546-553)
```typescript
const patterns = [/_(\d+)/, /(\d{4,})/, /\b(\d+)\b/];
```
- Match số sau dấu `_` đầu tiên: nếu tên KH có `Tài_2588p` thì OK, nhưng nếu là `Trịnh_ Hằng Kế Toán_2600p` → match `_` sai chỗ.
- Cụ thể `Khách Sạn Bảo Trân ( anh Văn Trọng Điền )_2588p` được link sang đơn 2513 → có thể do match số khác trong tên.

**Nguyên nhân 3 — Bug nghiêm trọng trong `InlineOrderEditTable.tsx` line 160-164**
```typescript
const inserts = newCodes.map(code => ({
  ghn_order_code: code,
  order_id: orderId,
  internal_order_code: code,  // ❌ Gán GHN code làm internal_order_code!
}));
```
Khi user chỉnh sửa thủ công mã GHN trong bảng đơn hàng, `internal_order_code` bị gán = mã GHN (vd: `GYWFCVTY`) thay vì số đơn nội bộ. Sau này nếu có ai chạy lại trigger auto-link, sẽ tìm `display_order_number = 'GYWFCVTY'` → không match → giữ nguyên `order_id`. May là không gây nhầm trực tiếp, nhưng làm hỏng dữ liệu `internal_order_code`.

**Nguyên nhân 4 — `save_tracking` action không truyền `order_id`** (`ghn-tracking/index.ts` line 304-322)
Khi sync từ GHN list, chỉ set `internal_order_code` mà không set `order_id` → phụ thuộc 100% vào trigger để link, mà trigger lại có 2 lỗi trên.

### Giải pháp đề xuất

**Fix 1 — Sửa trigger an toàn hơn** (migration)
```sql
CREATE OR REPLACE FUNCTION auto_link_ghn_tracking_to_order()
RETURNS trigger AS $$
DECLARE
  v_count int;
  v_order_id uuid;
BEGIN
  IF NEW.order_id IS NULL AND NEW.internal_order_code IS NOT NULL 
     AND NEW.internal_order_code ~ '^[0-9]+$' THEN  -- Chỉ link khi là số thuần
    SELECT COUNT(*), MIN(id) INTO v_count, v_order_id
    FROM public.orders
    WHERE display_order_number = NEW.internal_order_code;
    
    IF v_count = 1 THEN  -- Chỉ link khi DUY NHẤT 1 đơn match
      NEW.order_id := v_order_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Fix 2 — Cải thiện `extractOrderNumber`** (`ghn-tracking/index.ts`)
Ưu tiên pattern `_<số>p` (suffix với p/P) ở **cuối tên**, đây là quy ước user dùng:
```typescript
function extractOrderNumber(toName: string): string {
  // Ưu tiên: _<số>p ở cuối tên (vd: ..._2588p)
  let m = toName.match(/_(\d{3,5})[pPhH]?\s*$/);
  if (m) return m[1];
  // Fallback: _<số> bất kỳ
  m = toName.match(/_(\d{3,5})\b/);
  if (m) return m[1];
  return '';
}
```

**Fix 3 — Sửa `InlineOrderEditTable.tsx` line 160-164**
```typescript
// Lấy display_order_number của order để dùng làm internal_order_code
const order = orders.find(o => o.id === orderId);
const internalCode = order?.display_order_number || order?.order_number || null;

const inserts = newCodes.map(code => ({
  ghn_order_code: code,
  order_id: orderId,
  internal_order_code: internalCode,  // ✅ Số đơn nội bộ thật
}));
```

**Fix 4 — Script sửa dữ liệu cũ** (migration)
```sql
-- Sửa lại các bản ghi đã link sai
UPDATE ghn_tracking gt
SET order_id = correct.id
FROM (
  SELECT gt2.id as tracking_id, o.id
  FROM ghn_tracking gt2
  JOIN orders o ON o.display_order_number = gt2.internal_order_code
  WHERE gt2.internal_order_code ~ '^[0-9]+$'
    AND (SELECT COUNT(*) FROM orders WHERE display_order_number = gt2.internal_order_code) = 1
    AND (gt2.order_id IS NULL 
      OR gt2.order_id != (SELECT id FROM orders WHERE display_order_number = gt2.internal_order_code LIMIT 1))
) correct
WHERE gt.id = correct.tracking_id;
```

**Fix 5 — Resolve duplicate `display_order_number = 2248`**: Cảnh báo user về 2 đơn trùng số để xử lý thủ công (không tự gộp).

### Phạm vi thay đổi
- 1 migration (Fix 1 + Fix 4 + check duplicate)
- `supabase/functions/ghn-tracking/index.ts` (Fix 2)
- `src/components/InlineOrderEditTable.tsx` (Fix 3)

