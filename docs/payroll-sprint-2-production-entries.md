# Sprint 2: Sản lượng theo sản phẩm

Luồng mới ở tab **Sản lượng SP** của bảng chấm công xưởng ghi sản lượng theo
nhân sự, sản phẩm CRM và phiên bản đơn giá sản phẩm đã duyệt theo ngày. Dữ liệu
được lưu độc lập trong `production_entries`; đường OUTPUT tự do cũ trong
`factory_attendance_records` vẫn được giữ nguyên để tương thích lịch sử.

Migration mới: `20260911100000_production_entries_foundation.sql`.

Sản phẩm ngừng sử dụng không xuất hiện trong danh sách chọn. Sản phẩm thiếu SKU,
SKU trùng hoặc chưa có đơn giá hiệu lực được hiển thị ở trạng thái không khả
dụng và không thể gửi. Bản ghi được gửi chờ duyệt, có thể được duyệt/từ chối
theo phạm vi nhân sự hiện hành; mọi thao tác đều bị chặn khi ngày đã
`LEADER_CONFIRMED`. Ngược lại, quản lý cũng không thể chốt ngày khi còn sản
lượng `SUBMITTED`, tránh để bản ghi bị kẹt sau khi chốt. Chi phí chỉ trả về cho
tài khoản có quyền xem chi phí/mức công.

Export Excel 5 sheet hiện tại chưa đưa thêm sheet sản lượng trong sprint này để
giữ nguyên hợp đồng export và bộ kiểm thử hiện hữu. Có thể bổ sung sheet riêng
ở follow-up sau khi chốt hợp đồng dữ liệu export cho `production_entries`.
