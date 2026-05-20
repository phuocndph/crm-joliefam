# Lỗi cập nhật đơn GHN: "Not support change field: insurance_value with order status: delivering"

## Chẩn đoán

Log edge function ghi rõ:
```
GHN update response: { code: 400,
  message: "Lỗi gọi API: corev2_tenant_order_update -
    Not support change field: insurance_value with order status: delivering" }
```

Đơn `GYTV9XPB` đang ở trạng thái **`delivering`** (đang giao hàng). GHN khoá hầu hết các field khi đơn đã rời kho:

| Field | `ready_to_pick` / `picking` | `picked` / `storing` / `transporting` / `delivering` … |
|---|---|---|
| `to_name`, `to_phone`, `to_address`, `to_ward_code`, `to_district_id` | ✅ | ❌ (1 số tỉnh cho đổi địa chỉ qua API riêng) |
| `weight`, `length`, `width`, `height` | ✅ | ❌ |
| `insurance_value` | ✅ | ❌ ← chính field gây lỗi hôm nay |
| `items` | ✅ | ❌ (đã chặn đúng bằng `canEditItems`) |
| `cod_amount` | qua endpoint riêng `update_cod` | qua `update_cod` (giới hạn theo status) |
| `note`, `required_note`, `cod_failed_amount` | ✅ | ✅ (thường vẫn cho) |

Code hiện tại trong `src/components/EditGHNOrderDialog.tsx` (`handleSubmit` ~dòng 530-558) chỉ chặn `items` khi không phải `ready_to_pick/picking`, còn lại gửi nguyên xi mọi field → GHN reject ngay khi gặp `insurance_value`.

## Kế hoạch sửa

### 1. Phân loại trạng thái có thể sửa
Trong `EditGHNOrderDialog.tsx`, thêm hằng số:
```
EDITABLE_STATUSES = ['ready_to_pick', 'picking']            // sửa toàn bộ
LIGHT_EDITABLE_STATUSES = ['picked','storing','transporting',
                           'sorting','delivering','delivery_fail',
                           'waiting_to_return','return_transporting','return_sorting']
                                                            // chỉ note + required_note + cod_failed_amount
LOCKED_STATUSES = ['delivered','cancel','returned','lost','damage']
                                                            // không cho mở chỉnh sửa
```

### 2. `handleSubmit` build payload theo nhóm
- Nếu `currentStatus` ∈ `LOCKED_STATUSES` → toast lỗi rõ ràng, không gọi API.
- Nếu `LIGHT_EDITABLE_STATUSES`: payload chỉ gồm `note`, `required_note`, `cod_failed_amount` (và `cod_amount` xử lý riêng qua `update_cod` nếu GHN còn cho phép — đã có sẵn).
- Nếu `EDITABLE_STATUSES`: payload đầy đủ như hiện tại (bao gồm `items`).
- Bỏ field `insurance_value`, `weight`, dimensions, địa chỉ, … khỏi payload khi không phải EDITABLE_STATUSES.

### 3. UI hint khi đơn đã vận chuyển
Ngay khi prefill xong và biết status:
- Hiển thị banner vàng nhẹ ở đầu dialog:
  > "Đơn đang ở trạng thái **Đang giao hàng** — GHN chỉ cho phép sửa ghi chú, lưu ý giao hàng và phí giao lại. Các thông tin khác (cân nặng, kích thước, COD, địa chỉ, sản phẩm) đã bị khoá."
- Disable các input bị khoá (toName/toPhone/toAddress/weight/dims/insurance/items, dropdown shop) để user không kỳ vọng sửa được.
- Vẫn cho phép xem cước & dữ liệu thật từ GHN.

### 4. Xử lý lỗi rõ ràng hơn
Trong `callGHN` (`update_order` block ở edge function `ghn-tracking/index.ts` ~dòng 438-441) khi GHN trả 400 kèm `message` "Not support change field …", convert sang message tiếng Việt: "GHN không cho sửa trường `<tên field>` ở trạng thái `<status>`. Vui lòng huỷ đơn rồi tạo lại nếu cần điều chỉnh." Frontend toast hiển thị message này thay vì raw English.

### 5. (Tuỳ chọn nhỏ) Validate `cod_amount` thay đổi
Khi status không phải `ready_to_pick/picking/picked`, không gọi `update_cod` nữa (GHN hay trả lỗi tương tự) — báo "Không thể đổi COD ở trạng thái đang giao".

## Phạm vi sửa
- `src/components/EditGHNOrderDialog.tsx`: phân nhóm status, lọc payload, disable input, banner cảnh báo.
- `supabase/functions/ghn-tracking/index.ts`: dịch message GHN cho user-friendly trong `update_order`.

## Tóm tắt
GHN từ chối sửa hầu hết field khi đơn đã `delivering`. Dialog đang gửi đầy đủ payload nên trượt ngay vào `insurance_value`. Giải pháp: chỉ gửi các field GHN còn cho phép theo từng nhóm status, khoá input không sửa được, hiển thị banner cảnh báo và dịch message lỗi của GHN sang tiếng Việt.
