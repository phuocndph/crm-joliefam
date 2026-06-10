## Mục tiêu
Thêm 1 nút **"Tạo đơn GHN"** ngay cạnh nút **"Tạo báo giá"** trong header trang `/orders`, mở nhanh form tạo đơn GHN mà KHÔNG cần chọn trước 1 đơn hàng nội bộ — tiện cho việc tạo vận đơn rời (ví dụ gửi mẫu, ship lẻ, đơn ngoài hệ thống).

## Thay đổi

### 1. `src/components/CreateGHNOrderDialog.tsx`
- Cho phép prop `order` là **optional** (`order?: {...}`) và `remainingAmount` mặc định `0`.
- Khi không có `order` (chế độ standalone):
  - Bỏ qua toàn bộ logic prefill từ `order.customers`, `order.items`, `order.total_amount`.
  - Để form trống cho user nhập tay: Tên người nhận, SĐT, địa chỉ, sản phẩm, COD, kích thước...
  - Thêm 1 ô input **"Mã đơn nội bộ (tuỳ chọn)"** để user tự gõ nhãn (mặc định auto-generate kiểu `GHN-{timestamp}`). Giá trị này được gửi lên edge function dưới dạng `orderNumber` để lưu vào cột `internal_order_code` của `ghn_tracking`.
  - Gửi `orderId: null` lên edge function — bảng `ghn_tracking.order_id` đã nullable nên insert sẽ chạy bình thường.
  - Ô "Mã đơn hàng" hiện đang readOnly (dòng 1219) sẽ chuyển sang input cho phép sửa khi standalone.
- Khi có `order` (chế độ hiện tại — gắn với đơn nội bộ): giữ nguyên 100% hành vi cũ.

### 2. `src/pages/OrderManagement.tsx`
- Thêm state `standaloneGHNOpen` và 1 `<Button>` mới cạnh nút "Tạo báo giá" (line 433):
  - Icon `Truck`, label "Tạo đơn GHN", variant `outline`, size `sm`.
- Render thêm `<CreateGHNOrderDialog open={standaloneGHNOpen} onOpenChange={setStandaloneGHNOpen} onSuccess={() => setStandaloneGHNOpen(false)} />` (không truyền `order`).

### 3. Không cần migration DB
`ghn_tracking.order_id` đã nullable; edge function `ghn-tracking` action `create_order` đã chấp nhận `orderId` rỗng và insert được.

## Kiểm thử
- Click nút mới → dialog mở với form trống.
- Nhập đầy đủ địa chỉ → tính cước → tạo đơn → kiểm tra bản ghi mới xuất hiện trong `ghn_tracking` với `order_id IS NULL` và `internal_order_code` đúng nhãn user nhập.
- Mở dialog từ 1 đơn hàng (luồng cũ) vẫn prefill đầy đủ như trước.
