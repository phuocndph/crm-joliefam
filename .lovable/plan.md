## Mục tiêu
Trang `/ghn-tracking` hiện dùng bảng rộng tối thiểu 1800px → trên điện thoại (414px) phải cuộn ngang rất khó dùng. Sẽ thêm giao diện mobile dạng card, gọn gàng, giữ nguyên logic backend.

## Phạm vi thay đổi
Chỉ chỉnh UI/presentation trong `src/pages/GHNTrackingPage.tsx`. Không đụng vào edge function, hook, hay schema.

## Chi tiết triển khai

### 1. Dùng `useIsMobile()` (đã có sẵn) để switch layout

### 2. Thanh công cụ trên mobile
- Hai nút "Đơn lẻ / Nhiều đơn" giữ nguyên (full width, chia đôi).
- Input + nút "Thêm tracking" xếp dọc, full width.
- Các nút "Cập nhật tất cả", "In A5 (n)" xếp dọc full width, bỏ khối "Hiển thị x/y" (đã có trong filter).
- `GHNTrackingFilters` giữ nguyên (component này nên đã responsive; nếu chưa sẽ kiểm tra nhanh).

### 3. Thay bảng bằng danh sách card khi mobile
Mỗi card hiển thị:
```text
┌──────────────────────────────────┐
│ ☐  #STT  Mã GHN          [Badge] │
│    Mã đơn nội bộ                 │
│ ──────────────────────────────── │
│ 👤 Tên KH · SĐT                  │
│ 📍 Địa chỉ (wrap)                │
│ ──────────────────────────────── │
│ Cân: 1.2kg   COD: 150.000₫       │
│ Tạo: 10/05   Giao DK: 12/05      │
│ Giao TT: 13/05 (nếu có)          │
│ ──────────────────────────────── │
│ [Tra cứu] [In] [Sửa] [🔄] [🗑]   │
└──────────────────────────────────┘
```
- Card dùng `Card` shadcn, gap 3, padding 3.
- Checkbox chọn ở góc trên trái để hỗ trợ In A5 hàng loạt.
- Badge trạng thái góc trên phải.
- Nút thao tác là icon button kích thước chạm (>=40px), xếp ngang cuối card.
- Tap vào card không làm gì (tránh xung đột với nút trong card).

### 4. Phân trang trên mobile
- Hiển thị: "Trang 1/5 · 25/120 đơn" + 2 nút "‹ Trước" "Sau ›" full-width grid 2 cột.
- Selector "Số dòng/trang" đặt riêng phía trên, mặc định 25 trên mobile.

### 5. Giữ nguyên desktop
Bọc khối bảng hiện tại trong `{!isMobile && (...)}`, khối card trong `{isMobile && (...)}`. Toolbar cũng có 2 nhánh ngắn để không phá layout desktop.

### 6. Token & màu
- Tránh các class `bg-blue-800`, `text-gray-600`, `bg-gray-50` mới thêm — dùng `bg-card`, `text-muted-foreground`, `bg-muted/50` cho phần mobile mới để đúng design-system. Phần desktop giữ nguyên (không nằm trong yêu cầu).

## Không thay đổi
- Logic gọi `ghn-tracking`, real-time subscription, auto-update.
- `GHNTrackingFilters`, `EditGHNOrderDialog`.
- Schema DB.

## Kiểm thử
- Mở `/ghn-tracking` ở viewport 414×756: card hiển thị đầy đủ, không cuộn ngang.
- Chọn nhiều đơn → nút "In A5 (n)" hiện và bấm được.
- Chuyển sang desktop ≥768px: bảng cũ hoạt động bình thường.
