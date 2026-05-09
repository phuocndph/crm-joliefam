## Vấn đề

Khi duyệt báo giá ở trang **Báo giá**, đơn hàng mới đã được tạo trong DB nhưng trang **Đơn hàng** không cập nhật ngay — phải F5 mới thấy.

## Nguyên nhân

Trong `src/pages/QuotesPage.tsx` (hàm `handleApproveQuote`, ~dòng 319–323), sau khi tạo đơn hàng, code chỉ invalidate các queryKey cũ:

```ts
queryClient.invalidateQueries({ queryKey: ['quotes'] });
queryClient.invalidateQueries({ queryKey: ['orders'] });
```

Nhưng trang Đơn hàng (`OrderManagement.tsx`) hiện dùng `useInfiniteOrders` với queryKey `['orders-infinite', ...]`, và thẻ thống kê dùng `['orders-stats', ...]`, `['quotes-stats', ...]`. Hai key `['orders']` / `['quotes']` cũ không khớp nên cache không được làm mới.

Realtime subscription của `useInfiniteOrders` có lắng nghe `INSERT` trên `orders`, nhưng chỉ chạy khi user đang **mở** trang Đơn hàng (hook đã mount). Nếu user duyệt xong rồi mới chuyển sang trang Đơn hàng, dữ liệu trả về là cache cũ (staleTime = 60s) → phải reload.

## Giải pháp

Cập nhật danh sách invalidate trong `handleApproveQuote` (và `handleRejectQuote` cho đồng bộ) trong `src/pages/QuotesPage.tsx`:

```ts
queryClient.invalidateQueries({ queryKey: ['quotes'] });
queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
queryClient.invalidateQueries({ queryKey: ['orders'] });
queryClient.invalidateQueries({ queryKey: ['orders-infinite'] });
queryClient.invalidateQueries({ queryKey: ['orders-stats'] });
```

Việc này đảm bảo khi user mở trang Đơn hàng (dù đang mở sẵn hay chuyển vào sau), danh sách và bộ đếm thống kê đều refetch ngay, không cần F5.

## Phạm vi sửa

- 1 file: `src/pages/QuotesPage.tsx` — chỉ thêm các dòng `invalidateQueries` cho key mới. Không đụng tới logic nghiệp vụ, không đổi DB, không đổi UI.
