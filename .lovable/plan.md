

## Lý do giá cước GHN tính trên dialog vẫn lệch với GHN thực tế

Sau khi đối chiếu giữa payload hiện tại (`CreateGHNOrderDialog.tsx`) và tài liệu API GHN (`/v2/shipping-order/fee` vs `/v2/shipping-order/create`), tìm ra **5 nguyên nhân** khiến cước hiển thị ≠ cước GHN trừ thật:

### 1. Thiếu `items[]` khi gọi `calculate_fee` (NGUYÊN NHÂN CHÍNH)
- Hiện `calculate_fee` chỉ gửi `weight + length + width + height` ở mức tổng package.
- Nhưng `create_order` lại gửi kèm `items[]` (mỗi item có L/W/H/weight/quantity riêng).
- Với **Service 5 (hàng nặng)**, GHN tính cước **dựa trên `items[]`** (weight × quantity của từng item, hoặc max dim từng item), KHÔNG dùng package dim.
- Hậu quả: preview thấy cước thấp (vì dim 10×10×10 nhỏ) → khi tạo thật, GHN dùng items thật → cước cao hơn nhiều.

### 2. Thiếu `service_id` cho cước hàng nặng
- Đang gửi `service_type_id: 5` (generic). 
- API fee yêu cầu **`service_id`** (vd `100039`) để áp đúng `config_fee_id` của shop (mỗi shop có bảng giá hàng nặng riêng — log cho thấy `config_fee_id` thay đổi theo response).
- Khi thiếu `service_id`, GHN tính theo bảng giá mặc định, không khớp với bảng giá của shop được chọn.

### 3. `cod_failed_amount` không được gửi
- UI có checkbox "Giao thất bại thu tiền" + ô nhập `codFailedAmount` (mặc định 20000).
- Nhưng **không truyền** vào cả `calculate_fee` lẫn `create_order` → GHN tự tính phí giao thất bại theo policy mặc định → chênh lệch cước.

### 4. `coupon` không được hỗ trợ
- Nếu shop có coupon áp dụng tự động phía GHN, preview không phản ánh.
- Tuy ít gặp, vẫn cần fetch `coupon` từ shop config để khớp.

### 5. `pick_station_id` / `from_district_id` không truyền
- `calculate_fee` thiếu `from_district_id`. GHN sẽ dùng district mặc định của shop, nhưng nếu shop có nhiều warehouse hoặc address khác, kết quả lệch.
- Hiện trong `loadServices` đã có `fromDistrictId` nhưng KHÔNG truyền vào `calculate_fee`.

---

## Giải pháp

### Fix 1 — Truyền `items[]` vào `calculate_fee` (`CreateGHNOrderDialog.tsx` line 636-649 + `EditGHNOrderDialog.tsx`)

```typescript
const data = await callGHN('calculate_fee', {
  shopId: selectedShopId || undefined,
  feeData: {
    service_type_id: parseInt(serviceTypeId),
    service_id: services.find(s => s.service_type_id === parseInt(serviceTypeId))?.service_id, // NEW
    from_district_id: selectedShop?.district_id, // NEW
    to_district_id: parseInt(districtId),
    to_ward_code: wardCode,
    weight: displayWeight,
    length: effectiveDims.length,
    width: effectiveDims.width,
    height: effectiveDims.height,
    insurance_value: insuranceValue,
    cod_value: codAmount,
    cod_failed_amount: codFailedEnabled ? codFailedAmount : 0, // NEW
    items: productItems.map(p => ({  // NEW - khớp với create_order
      name: p.name || "Hàng hóa",
      quantity: p.quantity,
      weight: p.weight,
      length: p.length,
      width: p.width,
      height: p.height,
    })),
  }
});
```

### Fix 2 — Truyền `cod_failed_amount` vào `create_order` (line 673-690)

```typescript
cod_failed_amount: codFailedEnabled ? codFailedAmount : 0,
```

### Fix 3 — Đảm bảo `EditGHNOrderDialog` cũng đồng bộ
Áp dụng Fix 1 + Fix 2 cho `EditGHNOrderDialog.tsx` (kiểm tra payload tương tự).

### Fix 4 — Hiển thị cảnh báo nếu cước có thể lệch
Thêm chú thích nhỏ dưới ô cước hiển thị: *"Cước GHN cuối cùng có thể chênh lệch nhẹ tùy theo thực tế cân/đo tại bưu cục"* — để user biết preview là chính xác cao nhưng không phải tuyệt đối.

### Fix 5 — Log payload + response để debug tiếp nếu vẫn lệch
Trong `ghn-tracking/index.ts` action `calculate_fee`, log thêm `feeData` đầu vào để khi user báo lệch, ta đối chiếu được payload chính xác đã gửi.

```typescript
console.log('GHN fee request payload:', JSON.stringify(feeData));
```

---

## Phạm vi thay đổi
- `src/components/CreateGHNOrderDialog.tsx` — Fix 1, 2, 4
- `src/components/EditGHNOrderDialog.tsx` — Fix 1, 2 (đồng bộ)
- `supabase/functions/ghn-tracking/index.ts` — Fix 5 (log payload)

## Kết quả mong đợi
Cước hiển thị trên dialog tạo/sửa GHN sẽ **khớp** với cước GHN thực sự trừ, đặc biệt với đơn hàng nặng (≥20kg) nơi GHN tính theo `items[]` thay vì package dim.

