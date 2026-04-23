

## Lỗi: Thêm thanh toán báo "Thành công" nhưng UI không cập nhật

### Nguyên nhân (đã verify trên DB)

Tôi đã trace từ console + DB:

1. **Insert vẫn chạy đúng** — DB `order_payments` đang có 6 bản ghi cho đơn `ORD-1776907591288` (mỗi cái 2.900.000đ, total = 17.400.000đ) và 2 bản ghi cho `ORD-1776908189519`. Bạn bấm "Thêm thanh toán" 6 lần liên tiếp vì tưởng không có tác dụng → đã tạo 6 payment trùng lặp.

2. **UI vẫn hiển thị `0 payments, total: 0`** vì `useOrders` SELECT không trả payment về.

3. **Root cause**: trong `useOrders.ts` (line 71-75), query lấy payments dùng:
   ```ts
   supabase.from('order_payments').select('...').in('order_id', orderIds);
   ```
   **Không có filter `manager_id`**. RLS policy cho role `manager` là `manager_id = auth.uid()::text OR manager_id IS NULL`. Lẽ ra phải pass — NHƯNG client-side query đang chạy với 630 order IDs trong `.in(...)`, có khả năng vượt URL length limit của PostgREST → request fail âm thầm hoặc trả empty (vì `paymentsError` chỉ log, không throw).

   Verified: payment_count = 6 trong DB nhưng client log `0 payments`.

4. **Hệ quả phụ**: `handlePaymentAdded` dựa vào `loadOrders()` returnvalue (`result.data`) để cập nhật `selectedOrder` ngay — nhưng vì payment data về rỗng nên dialog đóng, status "paid" cập nhật ở bảng `orders` (do code update cuối hàm), nhưng **số "Đã thanh toán" trong dialog vẫn 0** → user tưởng chưa lưu → bấm tiếp.

5. **Bonus bug**: không có chống double-submit ở UI level → cho phép tạo nhiều payment trùng trong vài giây.

### Giải pháp

#### 1. Sửa `src/hooks/useOrders.ts` — fetch payments theo batch + xử lý error đúng

- Khi có nhiều order (>200), chia `orderIds` thành nhiều batch 200/lần để tránh URL quá dài làm PostgREST trả empty.
- Nếu `paymentsError` xảy ra → throw, không nuốt lỗi.
- Log số payment thực tế khớp với DB.

```text
fetchPayments(orderIds):
  chunks = chunk(orderIds, 200)
  results = []
  for each chunk:
    rows = supabase.from('order_payments')
             .select('order_id, payment_amount, payment_date, payment_type')
             .in('order_id', chunk)
    if error → throw
    results.push(...rows)
  return results
```

#### 2. Sửa `src/pages/OrderManagement.tsx` — `handlePaymentAdded` gọn lại

- Bỏ toast "Thanh toán đã được thêm thành công" thứ 2 (đã có trong `CreatePaymentForm`), tránh hiển thị 2 lần gây hiểu lầm.
- `loadOrders()` (refetch của react-query) trả về `{ data }` mới nhất → dùng nó cập nhật `selectedOrder` (đã đúng) — chỉ cần đảm bảo data về có payment.
- Vẫn giữ `setOrderToPayment(null)` trong `finally`.

#### 3. Sửa `src/components/CreatePaymentForm.tsx` — chống double-submit

- Disable nút "Thêm thanh toán" khi `loading=true` (kiểm tra xem nút đang dùng `disabled={loading}` chưa, nếu chưa thì thêm).
- Khi submit thành công, set một flag `submitted` để chặn click thêm lần nữa trong cùng phiên dialog (an toàn kép trước khi `onClose` chạy).

#### 4. Cleanup data rác đã tạo do bug

- 5 payment trùng cho `56c3d565-21c5-4ceb-bd58-3ffd7918bad1` (giữ lại bản gốc đầu tiên, xóa 5 bản sau).
- 1 payment trùng cho `be39ff90-8d7b-4558-9b0e-e74a3b006c2d` (giữ lại 1, xóa 1).
- Đồng thời xóa các bản `transactions` tương ứng (cùng `order_id` + `category='order_payment'` + cùng `payment_amount`/`payment_date`).
- Sẽ cần migration với DELETE cụ thể theo `id` để bạn duyệt.

### Phạm vi file
- `src/hooks/useOrders.ts` — chunk payment query + throw error
- `src/pages/OrderManagement.tsx` — bỏ toast trùng trong `handlePaymentAdded`
- `src/components/CreatePaymentForm.tsx` — chống double-submit
- Migration SQL — xóa 6 payment trùng + transaction trùng

### Không đụng vào
- Toàn bộ logic GHN (dialog tạo/sửa, fee, dimensions) đã chốt trước đó.
- RLS policies (chúng đã đúng).
- Schema `order_payments` / `transactions`.

### Kết quả mong đợi
- Bấm "Thêm thanh toán" 1 lần → dialog đóng, ô "Đã thanh toán" trong dialog đơn hàng cập nhật đúng số tiền vừa nhập, status đổi sang "Đã thanh toán" / "Thanh toán 1 phần".
- Không bấm được lần 2 trong khi đang loading.
- Console log `💰 Order ...: N payments, total: ...` khớp với DB.

