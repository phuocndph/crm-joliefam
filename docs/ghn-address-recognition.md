# Nhận diện địa chỉ trong dialog GHN local

## UX hiện tại — cập nhật 23/10/2026

Form có một ô địa chỉ đầy đủ chính; khi nhận diện đủ thì hiển thị tóm tắt ba cấp và thu gọn chỉnh tay. **Chỉnh địa chỉ GHN** mở ba combobox; mỗi cấp chỉ một ô tìm/chọn, không còn cặp ô tìm kiếm + select lặp. Hỗ trợ dấu/không dấu, bàn phím, mở lại sau chọn; Escape chỉ đóng danh sách đang mở. Thiếu hoặc mơ hồ thì yêu cầu chọn tay, không suy đoán ID hay sửa văn bản gốc.

Cước có thể tính khi chưa nhập tên sản phẩm (dùng tên tạm cho yêu cầu đọc); chỉ thao tác tạo đơn yêu cầu tên thật hợp lệ. Báo cáo mới nhất: [ghn-auto-selection-ux-2026-10-23.md](ghn-auto-selection-ux-2026-10-23.md).

## Cơ chế nhận diện và giao diện trước khi thu gọn (lịch sử)

Ô **Địa chỉ đầy đủ của khách** giữ nguyên văn bản người dùng nhập hoặc địa chỉ khách được điền sẵn. Sau 650 ms ngừng nhập, CRM so tên và `NameExtension` trong danh mục GHN, không gửi văn bản địa chỉ tới geocoder/provider và không ghi log/lưu thêm địa chỉ.

Địa chỉ đầy đủ được đọc từ phải sang trái: tỉnh/thành → tải quận/huyện của đúng tỉnh đó → tải phường/xã của đúng quận đó. Ví dụ `12 Nguyễn Huệ Bến Nghé Quận 1 Hồ Chí Minh` và `12 Nguyen Hue - Ben Nghe - Q.1 - TPHCM` đều nhận diện được khi danh mục GHN có duy nhất một bộ ba tương ứng. Chỉ tự chốt tên trần ở cuối khi đủ ba cấp duy nhất; tỉnh trần ở cuối chỉ cho phép thăm dò danh mục, không tự chọn tỉnh cho `12 Hà Nội`. Quy tắc cũ nhận phần địa chỉ hành chính có tiền tố rõ hoặc nguyên một đoạn ngăn bằng dấu phẩy/xuống dòng vẫn cho phép điền một phần để chọn tiếp thủ công. Không tìm phường trên toàn tỉnh, không suy đoán từ tên gần giống, không chuyển đổi địa chỉ hai cấp sang quận GHN.

Tên không dấu, đ/Đ, tên mở rộng GHN, TP.HCM/TPHCM, Q./P./H./X./TX./TT. và Quận1/Phường01 được hỗ trợ. Tên số phải có tiền tố hành chính; số nhà `1` không được hiểu là Quận 1 hoặc Phường 1. Tên khớp theo ranh giới từ nên Quận 1 không khớp Quận 10. Cụm ngay sau đường/phố/ngõ/hẻm/ngách không được tự hiểu là hành chính. Nhiều ID cùng khớp, thiếu cấp huyện hoặc địa chỉ hai cấp cần người dùng lựa chọn; không tự lấy kết quả đầu tiên.

Ngay dưới địa chỉ có gợi ý hành chính khi có truy vấn đủ rõ, ví dụ gõ `Hà N`, hoặc gõ một đoạn tỉnh sau dấu phẩy. Gợi ý quận/phường chỉ lấy trong cấp cha đã nhận diện duy nhất. Bấm gợi ý áp dụng các ID của danh mục mà không sửa địa chỉ gốc. Ba ô tỉnh, quận và phường đều có ô tìm kiếm tên có dấu/không dấu, danh sách kết quả bấm được và danh sách chọn đầy đủ dự phòng. Tìm quận phải chọn tỉnh; tìm phường phải chọn quận. Đây là gợi ý danh mục hành chính GHN, không phải dịch vụ tìm đường/số nhà như geocoder.

Nhập tiếp, tìm/chọn tay, tải lại danh mục, đóng/mở dialog, đổi đơn hoặc có lượt tạo chưa xác định sẽ vô hiệu hóa tác vụ nhận diện cũ. Phản hồi cũ không được đổi lựa chọn mới; cước cũ bị xóa khi địa chỉ thay đổi. Nút tạo bị khóa trong lúc nhận diện. Có thể nhận diện lại bằng nút ngay dưới địa chỉ. Trạng thái thiếu/lỗi danh mục dừng vòng chờ và hướng dẫn tải lại. Danh mục quận/phường được tái sử dụng theo ID cha trong phiên dialog, tải lại sẽ xóa bộ nhớ này. Chưa có tên kiện hàng thì chưa gọi tính cước để tránh lỗi nhập liệu bị hiểu nhầm là lỗi nhận diện.

Kiểm thử thuần, chỉ dữ liệu tổng hợp: `npx tsx scripts/test-ghn-address-match.mjs`. Kiểm tra UI qua fixture riêng; không tạo vận đơn thật để xác minh chức năng này.
