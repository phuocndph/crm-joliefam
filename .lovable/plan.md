

## Thêm Dialog tra cứu chi tiết đơn hàng GHN trong app

### Tổng quan
Thay link "Tra cứu" (mở web GHN) bằng nút mở dialog hiển thị chi tiết đơn hàng lấy từ GHN API `/v2/shipping-order/detail`, bao gồm timeline trạng thái, thông tin giao hàng, phí chi tiết.

### Các thay đổi

**1. Component mới `GHNOrderDetailDialog.tsx`**:
- Nhận `ghn_order_code` + `open/onOpenChange`
- Khi mở: gọi edge function action `track_order` (đã có sẵn) để lấy data real-time từ GHN
- Hiển thị:
  - Header: mã GHN + badge trạng thái
  - Thông tin người nhận: tên, SĐT, địa chỉ đầy đủ
  - Thông tin đơn: cân nặng, kích thước, nội dung hàng, ghi chú
  - Tài chính: COD, phí vận chuyển, phí bảo hiểm, tổng phí (từ `raw_data`)
  - Timeline: ngày tạo → ngày lấy hàng → dự kiến giao → ngày giao thực tế
  - Thông tin shop gửi (nếu có trong raw_data)
  - Nút "Mở trên GHN" link ra trang web GHN (giữ lại)
- Loading state khi đang fetch

**2. Edge function `ghn-tracking/index.ts`** -- Mở rộng action `track_order`:
- Trả về toàn bộ `raw_data` (hiện chỉ trả `transformOrder` đã lọc bớt field)
- Thêm trả `rawData: order` trong response để dialog có đầy đủ thông tin phí

**3. Trang `GHNTrackingPage.tsx`**:
- Import `GHNOrderDetailDialog`
- Thêm state `detailOrderCode` + `detailDialogOpen`
- Thay link `<a>Tra cứu</a>` bằng `<Button>` mở dialog
- Render `GHNOrderDetailDialog` ở cuối trang (sibling, không nested)

### Chi tiết kỹ thuật
- Tái sử dụng `fetchOrderDetail` đã có trong edge function
- GHN API detail trả đầy đủ: `cod_amount`, `insurance_value`, `coupon`, `total_fee` (phí ship), `main_service_fee`, `pick_station_fee`, `return_fee`, `r2s_fee`...
- Dialog dùng layout 2 cột trên desktop, 1 cột trên mobile

