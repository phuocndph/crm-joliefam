

## Vấn đề hiện tại

Có 2 lỗi chính:

### 1. GHN chặn iframe (X-Frame-Options)
URL `https://online-gateway.ghn.vn/a5/public-api/printA5?token=...` bị GHN chặn hiển thị trong iframe do header `X-Frame-Options: DENY` hoặc `SAMEORIGIN`. Kết quả: dialog mở nhưng iframe trắng, không hiển thị phiếu.

### 2. Dialog thiếu `aria-describedby`
Console warning: `Missing Description or aria-describedby={undefined}` cho DialogContent của print A5.

## Giải pháp

**Thay iframe bằng mở tab mới** — vì GHN không cho phép nhúng iframe, cách duy nhất là mở URL in phiếu trong tab mới. Bỏ dialog print A5, thay bằng `window.open()`.

### Thay đổi cụ thể

**1. `src/pages/OrderManagement.tsx`**
- Xóa state `printA5Url` và dialog Print A5 (dòng 826-841)
- Thay `setPrintA5Url(data.data.printUrl)` bằng `window.open(data.data.printUrl, '_blank')`
- Hiển thị toast thành công khi mở link

**2. `src/pages/GHNTrackingPage.tsx`**
- Tương tự: xóa state `printA5Url` và dialog Print A5 (dòng 906-919)
- Thay tất cả `setPrintA5Url(...)` bằng `window.open(..., '_blank')`

Lý do không dùng iframe: GHN server gửi header chặn embedding, không có cách nào bypass từ phía client.

