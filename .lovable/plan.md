

## Fix: KL tự điền linh tinh do useEffect auto-sync ghi đè

### Nguyên nhân
`useEffect` ở line 203-211 chạy mỗi khi `productItems` thay đổi (bất kỳ field nào: tên, số lượng, KL...) và luôn ghi đè `weight`, `length`, `width`, `height` của "Thông tin đơn hàng". Khi user sửa tay KL tổng, nó bị đè ngay lập tức.

### Giải pháp

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Bỏ useEffect auto-sync** (line 202-211) — không tự động ghi đè weight/length/width/height từ productItems nữa.

2. **Tính KL tổng tự động** thay vì dùng state riêng: Thay ô input `weight` bằng giá trị tính từ `totalItemWeight` (sum of item.weight * item.quantity). User điều chỉnh KL ở từng sản phẩm, KL tổng tự cập nhật.

3. **Giữ cho user override**: Thêm flag `weightManualOverride`. Khi user chưa sửa tay → hiện `totalItemWeight`. Khi user sửa tay → giữ giá trị user nhập, không bị đè.

4. **Sửa pre-fill**: Bỏ `setWeight(500)` và `setWeight(totalQty * 1000)` riêng — weight sẽ tự tính từ productItems (mỗi item weight=1000, quantity=totalQty → totalItemWeight = totalQty * 1000).

### Chi tiết kỹ thuật

```text
Xóa: useEffect trên [productItems] set weight/length/width/height (line 202-211)
Xóa: setWeight(totalQty * 1000) và setWeight(500) trong pre-fill (line 321, 324)

Thêm: const [weightManualOverride, setWeightManualOverride] = useState(false);
Sửa: weight hiển thị = weightManualOverride ? weight : totalItemWeight
Sửa: onChange của input weight → setWeight(val) + setWeightManualOverride(true)
Sửa: Reset weightManualOverride = false khi dialog mở lại
```

Kết quả: KL tổng = tổng (KL × SL) từ sản phẩm, user vẫn có thể sửa tay nếu cần.

