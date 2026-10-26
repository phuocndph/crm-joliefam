# Nhận diện địa chỉ trong dialog GHN local

## UX hiện tại — cập nhật 26/10/2026

Form chỉ có **một nút tóm tắt địa chỉ người nhận**, không có hai dòng nhập ngoài màn hình. Bấm mở popup riêng với ô địa chỉ và ba combobox tỉnh/quận/phường. Nội dung popup là bản chỉnh sửa tạm: **Hủy/Escape** bỏ toàn bộ thay đổi, **Xong** kiểm tra và áp dụng nguyên bộ văn bản + ID địa chỉ rồi mới tính lại cước. Phản hồi cũ bị vô hiệu khi đổi cấp cha, hủy/đóng popup, đổi đơn hoặc tài khoản. Hỗ trợ dấu/không dấu, bàn phím, mở lại sau chọn; Escape trước hết chỉ đóng danh sách đang mở. Thiếu hoặc mơ hồ thì yêu cầu chọn tay, không suy đoán ID hay sửa văn bản gốc.

Ô địa chỉ hỗ trợ **gợi ý địa chỉ đầy đủ từ Goong** khi quản trị viên đã bật dịch vụ. Nhân viên gõ/dán ít nhất 3 ký tự, ngừng 500 ms để xem tối đa 8 địa chỉ; chọn bằng chuột hoặc ↑/↓ và Enter. Escape đầu tiên đóng gợi ý, Escape tiếp theo hủy popup. Không gọi geocoder cho địa chỉ được điền sẵn hoặc tự gọi lại sau khi chọn gợi ý. Danh sách hành chính GHN vẫn là phần riêng, không giả làm địa chỉ đường/địa điểm.

Nếu chưa bật Goong, popup hiển thị thông báo nổi bật ngay dưới ô địa chỉ và hướng dẫn quản trị viên cấu hình tại **Cài đặt API → Goong**. Khóa GHN không thay thế khóa Goong cho tìm số nhà/tên đường. Nút **Kiểm tra lại gợi ý** có cả ở trạng thái chưa bật và lỗi; sau khi quản trị viên cấu hình ở tab khác, nhân viên có thể kiểm tra lại mà giữ nguyên bản nháp. Kiểm tra trạng thái không gửi địa chỉ tới Goong.

Quay lại hoặc bấm vào ô địa chỉ sau khi rời ô sẽ mở lại truy vấn do chính nhân viên đã gõ. Focus vào địa chỉ điền sẵn hoặc địa chỉ vừa chọn từ danh sách không tự gửi truy vấn. Escape giữ danh sách đóng cho tới thao tác gõ, focus hoặc bấm ô có chủ ý tiếp theo; thao tác chọn gợi ý vẫn chỉ cập nhật bản nháp cho đến khi bấm **Xong**.

Chọn gợi ý chỉ đưa văn bản vào bản nháp rồi đối chiếu danh mục GHN. ID tỉnh → quận → phường chỉ điền khi khớp duy nhất trong đúng cấp cha. Địa chỉ mới hai cấp, thiếu huyện hoặc mơ hồ giữ nguyên văn bản và yêu cầu chọn GHN thủ công; không dùng ID Goong làm ID GHN, không suy ra huyện từ tọa độ hoặc kết quả đầu tiên. **Xong** mới áp dụng nguyên bộ địa chỉ và tính lại cước; Hủy không đổi địa chỉ/cước của form cha.

### Cấu hình Goong trên Node/VPS

- Trang **Cài đặt API → Goong — gợi ý địa chỉ** chỉ cho quản trị viên thật lưu khóa; nhân viên có quyền đơn hàng/theo dõi GHN dùng gợi ý mà không đọc khóa. Có ba chế độ: khóa đã lưu, kế thừa `GOONG_API_KEY` ở máy chủ, tắt. Chuyển sang kế thừa/tắt sẽ xóa khóa đã lưu; ô khóa để trống khi đang dùng khóa đã lưu giữ nguyên khóa đó.
- Migration Node mới `server/db/migrations/063_local_goong_settings.sql` tạo bảng riêng trong `integration_private`, thu hồi quyền public và bật RLS. Không sửa migration lịch sử, không đồng bộ khóa sang Supabase/generic snapshots. Database owner và bản sao lưu database vẫn là ranh giới khóa lưu tại máy chủ, tương tự cấu hình GHN.
- Load/lưu/trạng thái cấu hình không gọi Goong. Khi được bật, nội dung nhân viên gõ được gửi đến Goong để tìm; quota/phí thuộc tài khoản Goong. Không tự đăng ký, tạo khóa hoặc thử khóa thật trong kiểm thử.
- Transport cố định `https://rsapi.goong.io/Place/AutoComplete`, không cho cấu hình URL, không redirect, timeout 5 giây, đọc tối đa 128 KiB. Tối đa 30 truy vấn/phút/tài khoản, 2 truy vấn đồng thời/tài khoản, 8 toàn máy chủ; bộ đếm giới hạn 1000 tài khoản và xóa mục hết hạn. Không cache/lưu/log địa chỉ, khóa, URL có khóa hoặc nguyên phản hồi lỗi; HTTP dùng `no-store`.
- Chưa bật/lỗi/rỗng/giới hạn yêu cầu đều có thông báo và cách chọn GHN thủ công. Lỗi chỉ thử lại khi nhân viên bấm, không tự lặp. Nhập nhanh, đổi cấp GHN, Hủy, đóng hoặc đổi phiên đăng nhập đều vô hiệu phản hồi cũ. IME không gửi nội dung đang gõ dở.
- Kiểm thử bằng fixture tổng hợp: `node --import tsx scripts/test-goong-address-adapter.mjs`, `node --import tsx scripts/test-ghn-like-form.mjs`, `node --import tsx scripts/test-goong-settings-isolated.mjs`. Bài cuối tạo/xóa container PostgreSQL riêng, không dùng database nghiệp vụ.

Mã popup ở `GhnReceiverAddressDialog.tsx`; phần tự nhận diện địa chỉ khách được điền sẵn vẫn giữ ở dialog cha. Tích hợp dựa trên hợp đồng AutoComplete đã có trong Edge Function cũ; chưa xác minh bằng khóa/provider thật. Tài liệu Goong công khai trả lỗi chứng chỉ hostname trong phiên triển khai, không bỏ qua xác thực TLS.

Cước có thể tính khi chưa nhập tên sản phẩm (dùng tên tạm cho yêu cầu đọc); chỉ thao tác tạo đơn yêu cầu tên thật hợp lệ. Báo cáo mới nhất: [ghn-auto-selection-ux-2026-10-23.md](ghn-auto-selection-ux-2026-10-23.md).

## Cơ chế nhận diện và giao diện trước khi thu gọn (lịch sử)

Ô **Địa chỉ đầy đủ của khách** giữ nguyên văn bản người dùng nhập hoặc địa chỉ khách được điền sẵn. Sau 650 ms ngừng nhập, CRM so tên và `NameExtension` trong danh mục GHN, không gửi văn bản địa chỉ tới geocoder/provider và không ghi log/lưu thêm địa chỉ.

Địa chỉ đầy đủ được đọc từ phải sang trái: tỉnh/thành → tải quận/huyện của đúng tỉnh đó → tải phường/xã của đúng quận đó. Ví dụ `12 Nguyễn Huệ Bến Nghé Quận 1 Hồ Chí Minh` và `12 Nguyen Hue - Ben Nghe - Q.1 - TPHCM` đều nhận diện được khi danh mục GHN có duy nhất một bộ ba tương ứng. Chỉ tự chốt tên trần ở cuối khi đủ ba cấp duy nhất; tỉnh trần ở cuối chỉ cho phép thăm dò danh mục, không tự chọn tỉnh cho `12 Hà Nội`. Quy tắc cũ nhận phần địa chỉ hành chính có tiền tố rõ hoặc nguyên một đoạn ngăn bằng dấu phẩy/xuống dòng vẫn cho phép điền một phần để chọn tiếp thủ công. Không tìm phường trên toàn tỉnh, không suy đoán từ tên gần giống, không chuyển đổi địa chỉ hai cấp sang quận GHN.

Tên không dấu, đ/Đ, tên mở rộng GHN, TP.HCM/TPHCM, Q./P./H./X./TX./TT. và Quận1/Phường01 được hỗ trợ. Tên số phải có tiền tố hành chính; số nhà `1` không được hiểu là Quận 1 hoặc Phường 1. Tên khớp theo ranh giới từ nên Quận 1 không khớp Quận 10. Cụm ngay sau đường/phố/ngõ/hẻm/ngách không được tự hiểu là hành chính. Nhiều ID cùng khớp, thiếu cấp huyện hoặc địa chỉ hai cấp cần người dùng lựa chọn; không tự lấy kết quả đầu tiên.

Ngay dưới địa chỉ có gợi ý hành chính khi có truy vấn đủ rõ, ví dụ gõ `Hà N`, hoặc gõ một đoạn tỉnh sau dấu phẩy. Gợi ý quận/phường chỉ lấy trong cấp cha đã nhận diện duy nhất. Bấm gợi ý áp dụng các ID của danh mục mà không sửa địa chỉ gốc. Ba ô tỉnh, quận và phường đều có ô tìm kiếm tên có dấu/không dấu, danh sách kết quả bấm được và danh sách chọn đầy đủ dự phòng. Tìm quận phải chọn tỉnh; tìm phường phải chọn quận. Đây là gợi ý danh mục hành chính GHN, không phải dịch vụ tìm đường/số nhà như geocoder.

Nhập tiếp, tìm/chọn tay, tải lại danh mục, đóng/mở dialog, đổi đơn hoặc có lượt tạo chưa xác định sẽ vô hiệu hóa tác vụ nhận diện cũ. Phản hồi cũ không được đổi lựa chọn mới; cước cũ bị xóa khi địa chỉ thay đổi. Nút tạo bị khóa trong lúc nhận diện. Có thể nhận diện lại bằng nút ngay dưới địa chỉ. Trạng thái thiếu/lỗi danh mục dừng vòng chờ và hướng dẫn tải lại. Danh mục quận/phường được tái sử dụng theo ID cha trong phiên dialog, tải lại sẽ xóa bộ nhớ này. Chưa có tên kiện hàng thì chưa gọi tính cước để tránh lỗi nhập liệu bị hiểu nhầm là lỗi nhận diện.

Kiểm thử thuần, chỉ dữ liệu tổng hợp: `npx tsx scripts/test-ghn-address-match.mjs`. Kiểm tra UI qua fixture riêng; không tạo vận đơn thật để xác minh chức năng này.
