

## Nâng cấp form tạo đơn GHN - giống giao diện GHN chính thức

### Tổng quan
Nâng cấp `CreateGHNOrderDialog` thành form đầy đủ theo quy trình GHN chính thức, bao gồm: chọn shop, nhập thông tin người nhận, tính cước phí trước khi tạo, hiển thị kết quả chi tiết sau khi tạo đơn.

### Thay đổi

**1. Edge Function: `supabase/functions/ghn-tracking/index.ts`**
Thêm 2 action mới:
- `get_shops`: Gọi `v2/shop/all` lấy danh sách shop (nếu tài khoản có nhiều shop)
- `calculate_fee`: Gọi `v2/shipping-order/fee` tính cước phí dựa trên thông tin đã nhập (district, ward, weight, dimensions, COD, service_type)
- `get_services`: Gọi `v2/shipping-order/available-services` lấy dịch vụ khả dụng theo tuyến (from_district → to_district)

**2. Component: `src/components/CreateGHNOrderDialog.tsx`** - Nâng cấp toàn diện

Chia form thành các bước/section rõ ràng với Tabs hoặc Accordion:

**Section 1 - Thông tin shop gửi hàng:**
- Dropdown chọn shop (từ API `get_shops`), mặc định shop đầu tiên
- Hiển thị địa chỉ shop đã chọn

**Section 2 - Thông tin người nhận:**
- Tên, SĐT (pre-fill từ đơn hàng)
- Tỉnh/Quận/Phường (dropdown cascade, giữ nguyên logic hiện tại)
- Địa chỉ chi tiết
- Yêu cầu khi giao: CHOTHUHANG / CHOXEMHANGKHONGTHU / KHONGCHOXEMHANG (radio group)

**Section 3 - Thông tin hàng hóa:**
- Cân nặng (g)
- Kích thước (dài x rộng x cao cm)
- Giá trị hàng hóa (insurance_value) - để tính phí bảo hiểm
- Số lượng sản phẩm
- Nội dung hàng hóa

**Section 4 - Dịch vụ & thanh toán:**
- Dịch vụ vận chuyển: tự động load từ API `get_services` theo tuyến đường
- Phí ship: Người gửi trả / Người nhận trả
- Tiền COD (VNĐ)
- Ghi chú giao hàng

**Section 5 - Xem cước phí (trước khi tạo):**
- Nút "Tính cước phí" gọi API `calculate_fee`
- Hiển thị bảng phí chi tiết: phí dịch vụ, phí bảo hiểm, phí COD, tổng cước
- Thời gian giao dự kiến

**Section 6 - Kết quả sau khi tạo đơn (thay thế success screen hiện tại):**
- Mã vận đơn GHN (copy được)
- Trạng thái đơn: "Sẵn sàng lấy hàng"
- Link tracking GHN
- Nút "In phiếu gửi" (mở link GHN print)
- Nút "Tạo đơn khác" / "Đóng"

### Chi tiết kỹ thuật

**GHN API endpoints sử dụng:**
- `GET /shiip/public-api/v2/shop/all` - danh sách shop
- `POST /shiip/public-api/v2/shipping-order/available-services` - dịch vụ khả dụng (cần `shop_id`, `from_district`, `to_district`)
- `POST /shiip/public-api/v2/shipping-order/fee` - tính cước (cần `service_type_id`, `to_district_id`, `to_ward_code`, `weight`, `dimensions`, `insurance_value`)
- `POST /shiip/public-api/v2/shipping-order/create` - tạo đơn (đã có)

**UI Layout:**
- Dialog mở rộng `max-w-3xl`
- Sử dụng Card sections với tiêu đề cho mỗi nhóm thông tin
- Cước phí hiển thị trong bảng tóm tắt trước nút "Tạo đơn"
- Badge hiển thị trạng thái tính cước (chưa tính / đang tính / đã tính)

