## Mục tiêu
Trang `/orders` đang dùng `InlineOrderEditTable` rộng → trên mobile (414px) phải cuộn ngang. Sẽ thêm giao diện mobile dạng card, gọn gàng, giữ nguyên logic backend & desktop.

## Phạm vi
Chỉ chỉnh UI/presentation trong `src/pages/OrderManagement.tsx`. Không đụng `InlineOrderEditTable`, hook, edge function, hay schema.

## Chi tiết triển khai

### 1. Dùng `useIsMobile()`
Switch giữa layout desktop (giữ nguyên) và mobile (mới).

### 2. Header + Stats trên mobile
- Tiêu đề "Quản lý Đơn hàng" cỡ nhỏ hơn (`text-lg`), nút "Tạo báo giá" full width khi mobile.
- Compact Stats Bar: chuyển thành lưới 2 cột (`grid grid-cols-2 gap-2`) trên mobile, mỗi ô gồm icon + số + nhãn, bỏ dấu `|` ngăn cách (chỉ hiện ở desktop).
- Cảnh báo trùng số đơn: giữ nguyên (đã responsive sẵn nhờ `Alert`).

### 3. Search + Filter trên mobile
- Ô tìm kiếm full width.
- Hàng chip trạng thái cuộn ngang (`overflow-x-auto flex-nowrap`), giữ kích thước chạm.
- Hai `Select` (Sắp xếp, Thanh toán) xếp 2 cột grid, full width, bỏ `ml-auto`.

### 4. Thay bảng bằng danh sách card khi mobile
Bọc `<InlineOrderEditTable .../>` trong `{!isMobile && (...)}`. Khi `isMobile`, render danh sách card:

```text
┌──────────────────────────────────┐
│ #Mã đơn (display)      [Trạng thái] │
│ Khách hàng · Mã KH                  │
│ ──────────────────────────────────  │
│ 👤 Phụ trách     📅 Hẹn giao dd/MM  │
│ 💰 Tổng: ...     ✅ Đã thu: ...     │
│ ⏳ Còn lại: ...  [Badge thanh toán] │
│ 🚚 GHN: code (nếu có)               │
│ ──────────────────────────────────  │
│ [Xem] [Sửa] [Thanh toán] [⋯]        │
└──────────────────────────────────┘
```

- Dùng `Card` shadcn từ `@/components/ui/card`, `p-3 space-y-2`.
- Card có viền trái màu `border-l-4` theo trạng thái + nền `bg-amber-50/70` khi số đơn nằm trong `duplicateNumberSet` (đồng nhất với desktop) + badge "Trùng".
- Tap vào card → mở `EditOrderDialog` (giống hành vi "Sửa" hiện có).
- Nút thao tác kích thước chạm ≥40px, dùng icon + label ngắn. Dropdown `⋯` chứa "Sửa số đơn", "Tạo vận đơn GHN", "Theo dõi GHN", "Xóa".
- Reuse các handler hiện có: `setEditingOrder`, `setDeletingOrder`, `setPayingOrder`, `setEditingOrderNumber`, `setGhnDialogOrder`, `setCreateGhnOrder`.

### 5. Infinite scroll
- Giữ `useInfiniteScroll` đang dùng — chỉ thay phần render bên trong, sentinel vẫn nằm cuối danh sách card.

### 6. Giữ nguyên desktop & logic
- `InlineOrderEditTable` chỉ render khi `!isMobile`.
- Mọi dialog (`EditOrderDialog`, `DeleteOrderDialog`, `CreatePaymentForm`, `EditOrderNumberDialog`, `GHNTrackingDialog`, `CreateGHNOrderDialog`) dùng chung — chỉ thay UI list.

### 7. Token & màu
Dùng `bg-card`, `text-muted-foreground`, `bg-muted/50`, `border-border`, `sidebar-primary` cho trạng thái "đã thanh toán" (theo core memory). Tránh thêm class `bg-blue-*/text-gray-*` mới.

## Không thay đổi
- Logic phân quyền, fetch, realtime, các hook, dialog, schema DB.
- `InlineOrderEditTable.tsx` (vẫn dùng cho desktop với cảnh báo trùng đã có).

## Kiểm thử
- Viewport 414×756: danh sách card hiển thị đầy đủ, không cuộn ngang; filter chip cuộn ngang mượt; mở/sửa/xóa/thanh toán đều hoạt động.
- Đơn trùng số → card có viền + badge "Trùng".
- Viewport ≥768px: bảng inline cũ hoạt động bình thường.
