

## Tạo đơn GHN tự động từ chi tiết đơn hàng

### Tổng quan
Thêm nút "Tạo đơn GHN" trong dialog chi tiết đơn hàng. Khi click, hiện form xác nhận với thông tin đã điền sẵn từ đơn hàng (tên, SĐT, địa chỉ, COD). Cho phép chỉnh sửa cân nặng, kích thước, ghi chú trước khi gửi lên GHN API.

### Yêu cầu từ GHN API
GHN API `v2/shipping-order/create` cần các thông tin:
- **Bắt buộc**: to_name, to_phone, to_address, to_ward_code, to_district_id, weight, service_type_id, payment_type_id
- **Tùy chọn**: cod_amount, note, content, length/width/height
- Cần tra cứu mã phường/quận từ GHN API (`province`, `district`, `ward`)

### Thay đổi

**1. Edge Function: `supabase/functions/ghn-tracking/index.ts`**
- Thêm 3 action mới:
  - `get_provinces`: Lấy danh sách tỉnh/thành từ GHN
  - `get_districts`: Lấy danh sách quận/huyện theo tỉnh
  - `get_wards`: Lấy danh sách phường/xã theo quận
  - `create_order`: Gọi GHN API tạo đơn vận chuyển, sau khi thành công tự động lưu tracking vào DB

**2. Component mới: `src/components/CreateGHNOrderDialog.tsx`**
- Dialog form với các trường đã điền sẵn:
  - Tên người nhận (từ customer name)
  - SĐT (từ customer phone)
  - Địa chỉ chi tiết (từ customer address)
  - Tỉnh/Quận/Phường: dropdown tra cứu từ GHN API
  - Cân nặng (gram) - mặc định 500g
  - Kích thước (dài x rộng x cao) - tùy chọn
  - Tiền COD (từ tổng tiền còn lại của đơn)
  - Ghi chú giao hàng
  - Loại thanh toán (người gửi/người nhận trả phí ship)
- Nút "Tạo đơn" gọi edge function
- Sau khi tạo thành công: hiển thị mã vận đơn GHN và tự động lưu vào bảng `ghn_tracking`

**3. File: `src/pages/OrderManagement.tsx`**
- Thêm nút "Tạo đơn GHN" trong dialog chi tiết đơn hàng (gần khu vực footer)
- Import và render `CreateGHNOrderDialog`

### Lưu ý kỹ thuật
- GHN API key (`GHN_API_KEY`) và Shop ID (`GHN_SHOP_ID`) đã có sẵn trong secrets
- Sau khi tạo đơn thành công, mã vận đơn sẽ tự động liên kết với đơn hàng qua trigger `trg_auto_link_ghn_tracking`
- Địa chỉ khách hàng hiện tại là text tự do, cần user chọn lại tỉnh/quận/phường từ dropdown GHN để đảm bảo chính xác

