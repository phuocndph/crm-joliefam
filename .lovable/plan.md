

## Thêm chức năng chỉnh sửa đơn hàng GHN (bao gồm COD)

### Phát hiện mới
GHN có **2 API riêng biệt** để cập nhật:
- `POST /v2/shipping-order/update` -- sửa thông tin chung (tên, SĐT, địa chỉ, cân nặng, kích thước...)
- `POST /v2/shipping-order/updateCOD` -- sửa tiền thu hộ COD (tối đa 5.000.000đ)

Cả hai đều sửa được, chỉ là dùng endpoint khác nhau. Dialog sẽ gọi cả 2 API khi cần.

### Các thay đổi

**1. Edge Function `ghn-tracking/index.ts`** -- Thêm 2 action mới:
- `update_order`: gọi GHN API update thông tin đơn (tên, SĐT, địa chỉ, cân nặng, kích thước, ghi chú...)
- `update_cod`: gọi GHN API updateCOD để sửa tiền thu hộ
- Sau khi GHN trả thành công, cập nhật lại bản ghi trong bảng `ghn_tracking`

**2. Component mới `EditGHNOrderDialog.tsx`**:
- Giao diện 2 cột giống hệt `CreateGHNOrderDialog` (form trái + sidebar phí phải)
- Pre-fill toàn bộ dữ liệu từ `raw_data` trong bảng `ghn_tracking`
- Các trường sửa được: tên, SĐT, địa chỉ (kèm Goong Maps + Tỉnh/Quận/Phường), cân nặng, kích thước, ghi chú, nội dung, COD, sản phẩm
- Tính cước phí real-time khi thay đổi thông tin
- Khi submit: gọi `update_order` + gọi thêm `update_cod` nếu COD thay đổi
- Nút "CẬP NHẬT ĐƠN" thay vì "TẠO ĐƠN"

**3. Trang `GHNTrackingPage.tsx`**:
- Thêm nút bút chì (Edit) trong cột THAO TÁC
- Ẩn nút sửa cho đơn ở trạng thái cuối (`delivered`, `cancel`, `returned`, `lost`, `damage`)
- Sau khi sửa thành công, refresh tracking data

### Trạng thái cho phép sửa
`ready_to_pick`, `picking`, `storing`, `transporting`, `sorting`, `delivering`

### Lưu ý kỹ thuật
- COD tối đa 5.000.000đ (giới hạn của GHN)
- Dialog tái sử dụng logic Goong Maps autocomplete + auto-match Tỉnh/Quận/Phường từ `CreateGHNOrderDialog`
- Áp dụng cùng fix `userTypingRef` để không gọi API tự động khi pre-fill

