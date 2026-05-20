## Vấn đề

Trong `src/components/EditGHNOrderDialog.tsx`, logic hiện tại chia 2 nhóm:
- `FULL_EDITABLE = [ready_to_pick, picking]` → gửi full payload
- Còn lại (picked, storing, transporting, delivering, …) → chỉ gửi `note / required_note / cod_failed_amount`
- `LOCKED = [delivered, cancel, returned, lost, damage]` → chặn save

Hệ quả: với đơn đang `picked/storing/transporting/delivering`, user **không sửa được địa chỉ giao và COD**, dù GHN vẫn cho phép.

GHN chỉ thực sự khoá một vài field nhạy cảm khi đơn đã rời kho:
- `insurance_value` — không đổi được sau khi đã `picked`
- `weight / length / width / height / items / content` — đổi được nhưng đôi khi GHN từ chối ở `delivering`
- `cod_amount` chỉ nên đi qua endpoint riêng `update_cod` (không nhét vào `update_order`)

## Thay đổi

### 1. `EditGHNOrderDialog.tsx` — `handleSubmit` (~dòng 542-639)

Thêm tầng trung gian `TRANSIT_EDITABLE = [picked, storing, transporting, delivery_fail, return, return_transporting, return_sorting, returning, return_fail]` — ở các trạng thái này:
- **Cho sửa**: `to_name, to_phone, to_address, to_district_id, to_ward_code, note, required_note, cod_failed_amount`
- **Bỏ khỏi payload**: `insurance_value`, `weight`, `length`, `width`, `height`, `items`, `content` (nếu GHN trả 400 cho field nào thì error mapping ở edge function sẽ báo chi tiết)
- **COD vẫn đi qua `update_cod` riêng** — mở rộng `COD_EDITABLE` thêm các status transit: `[ready_to_pick, picking, picked, storing, transporting, delivery_fail]` (theo tài liệu GHN, COD vẫn đổi được trước khi giao thành công).

Riêng `delivering` (shipper đang đi giao): GHN thường chặn cả địa chỉ — giữ chế độ "chỉ note + required_note + cod_failed_amount" cho status này. Tách ra `DELIVERING_ONLY_NOTES = [delivering]`.

Tóm tắt 3 tầng mới:
```
FULL_EDITABLE       = [ready_to_pick, picking]                 → gửi tất cả
TRANSIT_EDITABLE    = [picked, storing, transporting,          → gửi địa chỉ + note,
                       delivery_fail, return*, returning, ...]   bỏ insurance/weight/items
DELIVERING_ONLY     = [delivering]                              → chỉ note/required_note/cod_failed
LOCKED              = [delivered, cancel, returned, lost,       → chặn save
                       damage]
```

COD:
```
COD_EDITABLE = [ready_to_pick, picking, picked, storing,
                transporting, delivery_fail]
```

### 2. UI banner (~dòng banner cảnh báo)

Cập nhật message theo từng tầng:
- `TRANSIT_EDITABLE`: "Đơn đã rời kho — vẫn sửa được địa chỉ giao, COD, ghi chú; không đổi được trọng lượng/kích thước/bảo hiểm."
- `DELIVERING_ONLY`: giữ message hiện tại ("chỉ sửa được ghi chú và lưu ý giao hàng").

### 3. Disable input theo tầng (~khu vực form input)

- Ở `TRANSIT_EDITABLE`: enable các input `toName / toPhone / toAddress / province / district / ward / codAmount`, disable `weight / length / width / height / insuranceValue / items`.
- Ở `DELIVERING_ONLY`: disable hết trừ `note / requiredNote / codFailedAmount`.

### 4. Không đụng edge function

`ghn-tracking/index.ts` đã có translation lỗi GHN sang tiếng Việt từ lần trước, nên nếu vẫn còn field nào GHN từ chối ở một status cụ thể, user sẽ nhận message rõ ràng để mình tinh chỉnh thêm danh sách.

## Kiểm thử

- Đơn `GYTV9XPB` (đang `delivering`): vẫn rơi vào `DELIVERING_ONLY`, không bị 400 do `insurance_value` (đã loại khỏi payload).
- Đơn ở `transporting`: thử đổi địa chỉ giao + COD → cả 2 đều save được.
- Đơn `ready_to_pick`: hành vi giữ nguyên (full edit).
- Đơn `delivered`: vẫn bị chặn từ client.
