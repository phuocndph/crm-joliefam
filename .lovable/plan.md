

## In mã vận đơn GHN khổ A5

### Cách hoạt động

GHN cung cấp API in phiếu gửi hàng: `https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token` — trả về một token, dùng token đó mở URL `https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=...` để xem/in phiếu A5.

### Thay đổi cụ thể

**1. Edge Function `supabase/functions/ghn-tracking/index.ts`**
- Thêm action `print_a5`: nhận `orderCodes` (mảng mã đơn GHN), gọi API `gen-token` của GHN lấy token, trả về URL in phiếu A5

**2. Trang GHN Tracking `src/pages/GHNTrackingPage.tsx`**
- Thêm checkbox chọn nhiều đơn trong bảng
- Thêm nút "In phiếu A5" (icon Printer) ở toolbar — chỉ hiện khi có đơn được chọn
- Thêm nút in nhỏ ở cột Thao tác cho từng đơn
- Khi bấm: gọi edge function lấy token → mở tab mới với URL in phiếu GHN

**3. Dialog chi tiết đơn hàng `src/pages/OrderManagement.tsx`**
- Thêm nút "In vận đơn A5" ở action buttons (chỉ hiện khi đơn đã có mã GHN)
- Gọi cùng flow: edge function → mở tab in

### Chi tiết kỹ thuật

```text
Client gửi orderCodes[] → Edge Function gọi GHN gen-token API → Trả token → Client mở tab: https://online-gateway.ghn.vn/a5/public-api/printA5?token=TOKEN
```

API GHN gen-token:
- URL: `https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token`
- Method: POST
- Headers: `Token: GHN_API_KEY`
- Body: `{ "order_codes": ["GHN_CODE1", "GHN_CODE2"] }`
- Response: `{ "data": { "token": "..." } }`

