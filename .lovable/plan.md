
## Sửa lỗi chi phí hiển thị 0đ trong bảng lợi nhuận

### Nguyên nhân

Đơn hàng 2533: sản phẩm "Váy giường 1m6" (`cost_price: 240,000đ`) x 2 = **480,000đ**, nhưng hiển thị **0đ**.

1. Trường `cost_price` trong bảng `orders` được lưu là `0` khi tạo đơn
2. Logic fallback tính từ `productsMap` bị ảnh hưởng bởi **race condition**: `orderProfits` useMemo chạy khi `productsData` chưa load xong
3. `productsData` query có `staleTime: 10 phút` — nếu lần đầu trả về empty (do `orders` state chưa sẵn), kết quả cũ được cache

### Giải pháp

**File: `src/pages/CashFlowManagement.tsx`**

1. **Bỏ local state `orders`** — dùng trực tiếp `ordersData` từ React Query thay vì copy qua `useEffect` → `useState`. Điều này loại bỏ delay giữa data fetch và render

2. **Giảm `staleTime` của `productsData`** từ 10 phút xuống 0 — đảm bảo luôn re-fetch khi query key thay đổi

3. **Thêm `productsLoading` vào dependency** của `orderProfits` — chỉ tính toán khi products đã load xong, nếu đang loading thì return mảng rỗng hoặc giá trị tạm

4. **Cập nhật `cost_price` vào DB khi tính được** — sau khi tính cost từ products, gọi update order để lưu lại, tránh phải tính lại mỗi lần

### Thay đổi chi tiết

```text
Trước:
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  useEffect(() => { setOrders(ordersData); }, [ordersData]);
  // productsData staleTime: 10 minutes

Sau:
  // Dùng ordersData trực tiếp, sorted bằng useMemo
  const orders = useMemo(() => {
    return [...ordersData].sort((a, b) => ...);
  }, [ordersData]);
  // productsData staleTime: 0
  // orderProfits chỉ tính khi !productsLoading
```

| Vấn đề | Sửa |
|--------|-----|
| Race condition orders state delay | Dùng ordersData trực tiếp qua useMemo |
| Products cache 10 phút | Giảm staleTime về 0 |
| Tính toán khi products chưa load | Thêm guard `productsLoading` |
