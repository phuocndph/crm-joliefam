# Nghiệm thu thao tác màn sản xuất

Trạng thái: **chưa thực hiện**, không phải báo cáo PASS. Dùng bản repair2 đã
freeze/review/test/kích hoạt. Ghi phiên bản/hash, thời điểm, tài khoản theo vai
trò (không ghi mật khẩu/token), kích thước màn hình và ảnh/kết quả từng bước.
Không lấy ảnh cũ, HTTP200 hoặc build thành công thay kết quả thao tác.

## Môi trường và an toàn

- Thao tác ghi nhận/duyệt/xuất kho chỉ trên database giả lập được tạo riêng,
  với tài khoản/công việc kiểm thử. Không sửa hồ sơ/quyền hoặc tạo lệnh thử
  trên dữ liệu đang dùng để kiểm giao diện.
- Xác minh health/API/database/process hiện tại trước mỗi lượt. Không dùng
  manifest cũ như bằng chứng môi trường còn chạy; không restart vì timeout.
- Quan sát browser trước đây bị policy từ chối: không dùng driver/CDP hoặc
  browser khác làm đường vòng. Có thể nhận ảnh và kết quả thao tác trực tiếp
  từ người dùng, hoặc dùng phương thức quan sát mới được cho phép rõ ràng.
- Các ảnh không chứa tiền công người ngoài phạm vi, thông tin cá nhân không
  cần thiết, API key, mật khẩu hoặc token.

## Cỡ màn hình và vai trò bắt buộc

Mỗi nhóm dưới kiểm tại375px,768px và1440px;1440px thêm bàn phím và cuộn ngang.
Thử bằng tài khoản quản lý, Sale, thợ cắt, thợ may, gấp–là, kiểm đếm, kho,
tổ trưởng theo phạm vi, và thợ cắt đồng thời được lập dự toán. Không dùng
tài khoản admin để chứng nhận các vai trò còn lại.

## Các ca cần bằng chứng

| Ca | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| Tạo lệnh | Mở menu; tạo thủ công nhiều dòng hoặc lấy đơn bán | Chỉ có lựa chọn đúng quyền; màu/cỡ/quy cách/ảnh/ngày không mất khi lỗi; lưu không lặp |
| Bảng quản lý | Tìm/lọc; cuộn ngang; mở từng ô công đoạn | Cột cố định không đè chữ; nút luôn truy cập được; mở đúng lệnh/lô/dòng/công đoạn |
| Công đoạn đồng thời | Kế hoạch100, cắt duyệt40, còn60 chưa giao | Cùng dòng thấy ở Cắt và May; pending không làm dòng mất khỏi công đoạn liên quan |
| Chờ duyệt từng bước | Có báo pending ở cắt và may trên dữ liệu hợp lệ | Mỗi ô hiện đúng số báo chờ duyệt; số đạt đã duyệt không cộng pending |
| Vải | Xem nhu cầu/tồn sổ đúng kho; thiếu phụ liệu và vải | Phân biệt cần/đã cấp/đã trả; không cộng kg/cái vào mét; không hiểu preview là giữ chỗ |
| Thợ cắt đa quyền | Mở việc cá nhân và dự toán từ cùng workspace | Nhận/báo việc của mình được; dự toán vẫn dùng được; không có duyệt/giao việc quản lý |
| Hồ sơ0/1/nhiều | Mở bằng các tài khoản giả lập tương ứng | Không tự tạo/chọn hồ sơ; hồ sơ trùng có lỗi cấu hình; một hồ sơ hiện đúng công việc |
| Nhận việc | Thợ may xem trước/sau cắt duyệt40; nhận một phần | Trước duyệt không thấy việc; sau duyệt nhận trong hạn mức; nút to, không phải tự chọn nghề |
| Cuối ca | Mở nhiều việc, nhập ngày/số đạt/sửa/hỏng | Dòng đúng lệnh; tự chọn mã công/giá theo ngày; thiếu giá báo rõ, không coi là0 |
| Tiền ngày/tháng | Gửi rồi quản lý duyệt | Chờ duyệt/đã duyệt cập nhật đúng; không gọi là thực lĩnh/đã trả; người khác không thấy |
| Duyệt xuyên lệnh | Chọn báo từ ít nhất2lệnh; phân trang | Không phải mở từng lệnh; không có báo tự tạo/ngoài tổ; rõ trang và còn dữ liệu |
| Chỉ quyền duyệt | Tài khoản kế toán/tổ trưởng chỉ production_attendance_approve, có/không hồ sơ | Có đường vào duyệt nhanh đúng quyền; không ép cấp quyền xem điều hành/vải/giá vốn. Source/API đã sửa và kiểm21/10; thao tác UI vẫn chưa kiểm, chưa đánh PASS |
| Báo trên lệnh dừng | Mở báo SUBMITTED của lệnh/lô không hoạt động | Chỉ từ chối kèm lý do; không duyệt đạt. Khóa retry cũ vẫn giữ khi danh sách đổi |
| Sửa và quay lại | Từ kiểm đếm trả sửa rồi nghiệm thu | Đúng bước sửa; không nhân đôi hàng hoặc công; thấy lý do/lịch sử |
| Nhập/giao | Nhập/giao từng phần; xác nhận khách nhận | Không vượt số đạt/đã nhập; xác nhận không xuất kho lần nữa; nội bộ không bắt giao |
| Tải/rỗng/lỗi | Mở khi chậm, không có việc, mất quyền, API lỗi | Trạng thái rõ, có retry đúng; không toast thành công trước máy chủ |
| Giá theo ngày | Đổi ngày nhanh, response cũ đến sau; lỗi rồi retry | Mã/giá không cũ hoặc sai ngày; loading/error/retry rõ; không gửi mã ngoài lựa chọn |
| Lỗi từng dòng |5dòng có3thành công và2lỗi | Báo đúng3/5; khóa dòng thành công; giữ draft và khóa của dòng chưa rõ kết quả |
| Refresh/mount | Nhập draft; tải lại tiến độ; đóng/mở; mở2bảng cùng phiên | Không mất draft hoặc gửi khóa mới; một lượt gửi; bảng cũ không ghi đè bản mới |
| Đổi tài khoản | Đang gửi nhiều dòng thì logout/login người khác | Dừng dòng chưa gửi; không gửi dưới người mới; người cũ retry nguyên khóa được |
| Bàn phím | Tab/ShiftTab/Enter/Escape, mở/đóng modal, lỗi nhập | Thứ tự focus hợp lý; thấy focus; đóng trả focus; không bị kẹt hoặc phải dùng chuột |
| Mobile | Nhận/báo/duyệt; xoay màn; bàn phím số/ngày mở | Chữ chính16–18px, mục tiêu44–48px; nút không bị che; không kéo bảng rộng để tìm thao tác |

## Phiếu ghi nhận mỗi ca

- Ngày/giờ, phiên bản/hash và môi trường được xác minh:
- Vai trò, tên ca, viewport, trình duyệt:
- Các bước thực tế và dữ liệu giả lập được dùng:
- Kết quả quan sát, ảnh minh chứng, PASS/FAIL/chưa kiểm:
- Nếu FAIL: hành vi mong muốn, hành vi thực tế, khả năng tái hiện:
- Người kiểm và người rà lại:

Chỉ đóng nghiệm thu khi không còn ca bắt buộc chưa kiểm hoặc FAIL chưa xử lý.
Nếu hết hai vòng sửa giới hạn, báo finding còn lại và hướng xử lý; không đổi
tiêu chí hoặc gán PASS dựa trên suy luận từ mã nguồn.
