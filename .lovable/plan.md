

## Phân tích lỗi tính giá cước GHN khi tạo đơn

### 4 nguyên nhân khiến cước tính sai

**Nguyên nhân 1 — Hàng nặng (≥20kg / Service 5): KHÔNG truyền kích thước đã tính** (`CreateGHNOrderDialog.tsx` line 268-274, 638)

Khi đơn là hàng nặng, code đã tính sẵn `heavyCargoCalc` = {Max(Dài) × Max(Rộng) × Sum(Cao)} đúng theo memory. Nhưng khi gọi `calculate_fee` và `create_order`, code vẫn gửi `length, width, height` từ state thủ công ban đầu (mặc định 30×20×10) → **GHN tính cước theo kích thước nhỏ → cước thấp giả**, hoặc khi tạo đơn thật thì GHN dùng items để recalc → ra cước cao hơn nhiều so với màn hình tính cước.

→ Hậu quả: số tiền hiển thị `feeDetail.total` ≠ cước thực GHN trừ.

**Nguyên nhân 2 — `weight` truyền vào fee là KL thực, không phải KL tính cước** (line 638)

Code gửi `weight: displayWeight` (KL thực) nhưng đã tính sẵn `effectiveWeightGram = max(displayWeight, dimensionalWeight)`. GHN API yêu cầu truyền KL thực + Dài/Rộng/Cao và **GHN tự quy đổi**, nên về lý thuyết OK. NHƯNG với hàng nặng (Service 5), GHN tính theo `items[].weight × quantity` → nếu items có `weight` nhỏ/sai, cước sai.

Cụ thể: ở line 304-311 (auto-fill khi mở dialog), `productItems` được set với `weight: 1000` cho **toàn bộ summary** thay vì từng item → tổng KL = 1kg dù đơn 5 sản phẩm. Người dùng phải sửa tay, nếu quên sẽ tính cước sai.

**Nguyên nhân 3 — `cod_value` thay vì `cod_amount`** (line 640)

API GHN `/v2/shipping-order/fee` nhận tham số `cod_value` ✓ đúng — không sai chỗ này.
Nhưng `/v2/shipping-order/create` lại nhận `cod_amount` (line 663) ✓ — đúng cho create.
**Vấn đề**: 2 tên khác nhau cùng nghĩa, dễ nhầm khi đối chiếu fee vs reality.

**Nguyên nhân 4 — `insurance_value` ảnh hưởng cước nhưng không được validate** (line 639, 663)

Khi user nhập `insurance_value` lớn (>1tr), GHN tính thêm phí bảo hiểm. Nhưng khi tạo đơn thật, `insurance_value` mặc định `0` (state line 170) → user thường quên nhập → cước hiển thị (có insurance) ≠ cước thực (không insurance) hoặc ngược lại.

### Giải pháp

**Fix 1 — Truyền đúng kích thước hàng nặng vào fee/create** (`CreateGHNOrderDialog.tsx` + `EditGHNOrderDialog.tsx`)

```typescript
// Helper: chọn kích thước hiệu lực
const effectiveDims = isHeavyCargo && heavyCargoCalc
  ? { length: heavyCargoCalc.maxLength, width: heavyCargoCalc.maxWidth, height: heavyCargoCalc.sumHeight }
  : { length, width, height };

// calculate_fee
weight: displayWeight, ...effectiveDims,

// create_order  
weight: displayWeight, ...effectiveDims,
```

Cũng cập nhật UI hiển thị: khi hàng nặng, ô Dài/Rộng/Cao trong "Thông tin đơn hàng" auto-fill từ `heavyCargoCalc` và disable (read-only) để user thấy chính xác con số GHN dùng.

**Fix 2 — Phân bổ KL khi auto-fill từ đơn nhiều sản phẩm** (line 297-317)

Hiện gộp tất cả thành 1 dòng `weight: 1000`. Sửa thành: tạo nhiều `productItems`, mỗi item giữ KL riêng hoặc ít nhất `weight: 1000 * totalQty / items.length`. Hoặc đơn giản hơn: set `weight: 1000`, `quantity: totalQty` để tổng KL = `1000 × totalQty` (gram) thay vì cố định 1kg.

**Fix 3 — Cảnh báo khi feeDetail dùng input khác với create payload**

Thêm useEffect theo dõi `length/width/height/weight/insurance_value/codAmount`: nếu thay đổi sau khi tính cước → reset `feeDetail = null` và `feeStatus = "idle"` + hiển thị badge "Cần tính lại cước". Hiện đã có dependency array (line 626) nhưng chỉ debounce 500ms — user click "Tạo đơn" trong khi đang debounce sẽ submit với fee cũ.

Thêm guard ở `handleSubmit`:
```typescript
if (feeStatus !== "done" || loadingFee) {
  toast({ title: "Vui lòng đợi tính cước xong", variant: "destructive" });
  return;
}
```

**Fix 4 — Auto-fill `insurance_value` từ `codAmount`** 

Khi `codAmount` thay đổi và `insuranceValue === 0`, set `insuranceValue = codAmount` (giống pattern `EditGHNOrderDialog.tsx` line 146 đã làm). Tránh user quên nhập → cước fee bị thấp giả → khi GHN trừ cước thật cao hơn.

### Phạm vi thay đổi
- `src/components/CreateGHNOrderDialog.tsx` — Fix 1, 2, 3, 4
- `src/components/EditGHNOrderDialog.tsx` — Fix 1, 3 (đã có Fix 4)

### Kết quả
Cước hiển thị trên dialog = cước GHN thực sự trừ khi tạo đơn. Loại bỏ hoàn toàn chênh lệch do truyền sai kích thước hàng nặng hoặc submit khi fee chưa cập nhật.

