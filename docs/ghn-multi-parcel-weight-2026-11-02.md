# GHN: tổng cân nặng nhiều kiện — 02/11/2026

CRM trước đây áp dụng giới hạn 50.000 gram của một kiện cho cả vận đơn.
Vì vậy 2 kiện × 30 kg bị chặn trước khi gửi yêu cầu báo cước hoặc tạo đơn GHN.

## Thay đổi

- Bỏ trần tổng 50 kg cho vận đơn có nhiều kiện thực tế. Ví dụ 2 × 30 kg và
  3 × 40 kg giữ nguyên tổng 60.000 và 120.000 gram.
- Giữ phạm vi hiện tại của CRM: 1–100 kiện; mỗi kiện 1–50.000 gram, mỗi chiều
  1–200 cm. Trần kỹ thuật 5.000.000 gram là hệ quả của 100 × 50.000,
  không phải tuyên bố GHN nhận mọi đơn đến 5 tấn.
- Tổng phải khớp tổng cân từng kiện. Không chia kiện tự động, cắt giảm cân nặng,
  nhân COD, hoặc dựng kích thước chung cho nhiều kiện.
- Giao diện, lọc dịch vụ, báo cước địa chỉ cũ, xem trước địa chỉ mới và tạo đơn
  dùng cùng manifest. Nhiều kiện dùng dịch vụ 5; giá cước do GHN trả về.
- Tổng khối lượng sản phẩm có thể vượt 50 kg; người dùng phải khai các kiện
  đã đóng gói để báo cước. Số lượng sản phẩm không được hiểu là số kiện.
- Sửa thông số vật lý của vận đơn nhiều kiện sau khi tạo vẫn nằm ngoài thay đổi
  này; không gộp manifest thành một kiện khi sửa.

## Giới hạn xác minh với GHN

[Tài liệu tạo đơn GHN](https://developer.ghn.vn/vi/docs/order/create) hiện vẫn
ghi trường `weight` tổng tối đa 50.000 gram. Tài liệu phí tại
<https://developer.ghn.vn/vi/docs/order/calculate-fee> mô tả dịch vụ 5 tính theo từng item.
Do đó khả năng nhận vận đơn tổng trên 50 kg qua API của tài khoản thật vẫn cần
được GHN xác nhận. Giới hạn mỗi kiện 50 kg được giữ từ CRM hiện tại, chưa phải
giới hạn riêng từng kiện đã được xác nhận từ tài liệu GHN.

Kiểm thử chỉ dùng dữ liệu và transport giả lập, không tạo vận đơn thật. CRM gửi
đúng cân thực tế, không sửa số liệu để lách giới hạn của nhà vận chuyển. GHN
vẫn quyết định hỗ trợ tuyến/dịch vụ/tài khoản và kết quả tạo đơn.

Không thay đổi migration, dependency hoặc cấu hình triển khai. Cần cập nhật
cả frontend và backend trên VPS; sửa mã nguồn không tự cập nhật bản chính.
