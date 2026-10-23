# Ví dụ cần chốt cho phần nghiệp vụ còn lại

Ngày 16/10/2026. Trạng thái: **chờ quyết định nghiệp vụ, chưa phải cấu hình áp dụng**. Các số dưới đây hoàn toàn là ví dụ tổng hợp để chốt kết quả kỳ vọng; không phải dữ liệu nhân viên, mức đề xuất, hay diễn giải quy định pháp luật.

Luồng giao diện và đối soát ở đợt 1–2 dùng công thức hiện có. Các tình huống dưới đây chỉ được mở trong engine sau khi có quy tắc, phạm vi, ngày hiệu lực, người duyệt và bộ kết quả kỳ vọng. Kế hoạch được duyệt không tự xác định các giá trị này.

| Mã | Ví dụ đầu vào | Phần đã rõ | Quyết định/kết quả cần người phụ trách xác nhận |
|---|---|---|---|
| NV-01 | Lương tháng 2.600.000đ; lịch 26 ngày; 25 ngày công đã duyệt + 1 ngày nghỉ hưởng lương | 25 ngày công theo công thức hiện có = 2.500.000đ trước khoản khác | Ngày nghỉ được hưởng bao nhiêu, theo mức nào, hạn mức/người duyệt; loại lương giờ/sản phẩm có được hưởng không? |
| NV-02 | Một ngày vừa có trạng thái nghỉ hưởng lương, vừa có 4 giờ công/sản lượng được duyệt | Không được vô tình trả trùng cùng thời lượng | Chọn loại nguồn nào, có được nghỉ nửa ngày không, ai xử lý mâu thuẫn trước khi tính? |
| LE-01 | Lương tháng 2.600.000đ; 26 ngày chuẩn; 480 phút/ngày; ngày lễ có 480 phút làm + 120 phút tăng ca | Giờ công thường và tăng ca là nguồn riêng; cần rule đúng ngày/nhóm/cơ sở | Tiền ngày lễ thay thế hay cộng lương thường; hệ số/đơn giá từng phần; thưởng lễ riêng có được cộng không; cách tránh đếm 120 phút hai lần? |
| LE-02 | Công Chủ nhật, nhóm trả giờ cố định và nhóm quy đổi từ lương tháng | Tăng ca Chủ nhật đã có rule riêng theo ngày; không được seed một hệ số chung | Phần công chính Chủ nhật thuộc loại nào, có khác ngày thường không; giới hạn/phạm vi của từng nhóm? |
| QT-01 | Nghỉ giữa kỳ, 13 ngày công hợp lệ; lương tháng 2.600.000đ/26 ngày; phụ cấp cố định 500.000đ; BHXH ví dụ 526.050đ | 13 ngày công = 1.300.000đ trước các khoản khác | Phụ cấp/BHXH/khấu trừ cố định thu đủ, theo tỷ lệ hay quyết toán riêng; dùng mốc ngày nào; làm tròn ở bước nào? |
| QT-02 | Người đã nghỉ nhưng còn sản lượng/tăng ca/điều chỉnh đã duyệt chưa được trả | Vẫn phải xuất hiện trong phạm vi quyết toán; không tự bỏ qua do trạng thái nghỉ | Kỳ trả khoản còn lại; có khoản nợ/tạm ứng thì xử lý thế nào; trường hợp thực nhận âm do ai quyết định? |
| DC-01 | Bảng lương đã khóa; phát hiện thiếu 100.000đ tiền công có chứng từ | Không sửa item/bản khóa cũ; cần nguồn điều chỉnh, lý do và audit | Bù kỳ sau hay kỳ phụ; ai tạo/duyệt; phiếu lương ghi kỳ gốc và số tiền chênh như thế nào? |
| DC-02 | Bảng lương đã khóa; phát hiện trả thừa 100.000đ, nhân sự không còn kỳ sau | Bản khóa gốc vẫn bất biến | Quy trình truy thu/quyết toán, kỳ phụ và xác nhận hoàn trả; không tự tạo khoản khấu trừ vượt số phải trả? |
| PD-01 | Quản lý có một lô công/sản lượng chờ duyệt, trong đó có dòng bất thường | Hiện có duyệt theo lô có kiểm tra máy chủ; không tự chuyển sang auto-approval | Ngưỡng bất thường theo nguồn/nhóm; có cần người nhập khác người duyệt; khoản nào luôn phải xem riêng? |
| TT-01 | Một run đã khóa, 3 người nhận qua ngân hàng, 1 tài khoản chưa xác minh | Khóa kỳ không phải đã chi trả; tài khoản tự khai không tự thành VERIFIED | Ngân hàng/mẫu file, ngày chi trả, nội dung giao dịch, xác nhận người nhận; người thiếu tài khoản nhận bằng cách nào? |
| TT-02 | Xuất file ngân hàng, 1 giao dịch thành công và 1 thất bại; người dùng bấm lại | Số phải trả lấy từ snapshot khóa; không được tạo hai khoản chi chỉ vì thử lại | Bằng chứng thành công/thất bại, mã đối chiếu, quyền nhập kết quả và quy trình tạo lại đúng khoản thất bại? |

Khi chốt một dòng cần ghi: người xác nhận, ngày xác nhận, áp dụng từ ngày nào, nhóm/cơ sở/loại lương, công thức hoặc số tiền kỳ vọng chính xác, trường hợp ngoại lệ. Cần thêm các ca biên trước/đúng/sau ngày hiệu lực và ca có hai người thao tác đồng thời.

Để làm đợt thanh toán cần cung cấp tên ngân hàng và mẫu file trống hoặc đã bỏ dữ liệu cá nhân, cùng quy trình xác nhận đã trả. Không cần cung cấp tài khoản đăng nhập ngân hàng, token hay mật khẩu.
