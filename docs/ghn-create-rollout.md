# Phát hành luồng tạo vận đơn GHN trên Node

Thay đổi này chuẩn bị mã nguồn để người vận hành cập nhật máy chủ sau khi đưa dự án lên GitHub. Chưa triển khai, chưa gọi GHN thật, chưa áp dụng migration vào database đang vận hành. Không tự khởi động lại, push hay phát hành từ các bước kiểm thử.

## Trước khi cập nhật máy chủ

1. Chốt chính xác diff đưa lên GitHub. Working tree hiện có nhiều thay đổi ngoài GHN, gồm migration trước 061; không sao chép riêng vài file rồi bỏ các phụ thuộc hiện tại.
2. Sao lưu database và cấu hình ngoài Git; xác minh có thể khôi phục trên staging. Khóa GHN trong `integration_private.ghn_settings` hiện lưu plaintext-at-rest. Người có quyền database/operator/backup nằm trong ranh giới bảo mật.
3. Kiểm tra `local_schema_migrations`, checksum và toàn bộ migration chưa áp dụng. Bootstrap Node tự chạy mọi migration mới theo thứ tự trong một transaction; cập nhật mã rồi khởi động API có thể áp dụng cả migration không liên quan GHN. Không sửa migration đã áp dụng, không xóa ledger để chạy lại.
4. Chạy staging với bản sao database đã che dữ liệu nhạy cảm. Cần 061 (`ghn_settings`) trước 062 (`ghn_order_attempts`), cùng các bảng auth, quyền, đơn hàng, tombstone, audit và tracking hiện có. Gợi ý địa chỉ dùng thêm 063 (`goong_settings`), bảng cấu hình riêng có RLS và không cấp quyền public. Kiểm tra schema riêng không đi qua snapshot/compatibility/sync.
5. Xác nhận máy chủ dùng Compose, PM2 hay quy trình khác rồi dùng quy trình vận hành đó; chưa có lệnh triển khai chung đã xác minh. Push GitHub không tự cập nhật máy chủ. Chỉ cập nhật API/web sau khi preflight và backup đạt yêu cầu.

## Cấu hình và kiểm tra

Đăng nhập tài khoản quản trị thật, vào Cài đặt API. Nhập khóa, bấm Lấy cửa hàng từ GHN, chọn các cửa hàng được phép và cửa hàng mặc định, rồi Lưu cấu hình. Khóa và danh sách shop là cùng một nguồn cho tạo đơn, dịch vụ, tính cước và theo dõi. Trường khóa trống giữ khóa đã lưu khi đang ENABLED; không tự sao chép khóa env. Đã tắt chặn các yêu cầu GHN mới, gồm đối soát provider; vẫn đọc được kết quả lượt tạo đã lưu trong CRM.

Kiểm tra kết nối là chỉ-đọc, có thể gọi nhiều trang cửa hàng cố định. Tạo đơn là thao tác có ảnh hưởng thật và chỉ chạy khi người dùng bấm Tạo vận đơn. Kiểm thử staging dùng mock trước; kiểm tra GHN thật cần người vận hành chủ động xác nhận cửa hàng, người nhận và chi phí.

Goong cấu hình độc lập trong Cài đặt API, bằng khóa đã lưu hoặc `GOONG_API_KEY` ở máy chủ. Đọc/lưu cấu hình không gọi provider; chỉ khi bật và nhân viên sửa ô địa chỉ thì đoạn nhập mới được gửi Goong. Trạng thái đã cấu hình không đảm bảo khóa đã kết nối hoặc còn quota. Khi thiếu khóa/tắt/lỗi, giữ nhập và chọn địa chỉ GHN thủ công. Không cần provider Goong để tạo vận đơn đã chọn đủ bộ địa chỉ GHN.

## Lượt tạo và khôi phục

Sổ riêng lưu actor, manager, tenant, đơn CRM, shop, phiên bản cấu hình, khóa idempotency, hash payload, mã tham chiếu và trạng thái. Request đã chuẩn hóa chứa thông tin người nhận cần thiết để phục hồi, được giữ trong schema riêng; không ghi raw provider response, khóa hoặc PII vào audit/log. Cần chính sách lưu giữ/backup phù hợp trước production; chưa tự xóa sổ vì có thể làm mất bằng chứng chống tạo trùng.

Trước khi gửi provider, một transaction ngắn giữ lượt IN_FLIGHT. Không gọi mạng trong transaction. Cùng actor/key và nội dung phát lại cùng kết quả; đổi nội dung trả 409. Một actor không tạo lượt mới trong cùng phạm vi khi vẫn còn IN_FLIGHT/UNKNOWN/REMOTE_CREATED, nhưng có thể tạo nhiều vận đơn cho cùng đơn CRM sau lượt trước đã kết thúc.

Timeout, process crash, phản hồi không hợp lệ hoặc không lưu được bằng chứng provider không tự gửi create lần nữa. IN_FLIGHT/UNKNOWN vẫn khóa; dùng Tải lại trạng thái và Đối soát GHN theo `client_order_code`. Lookup chỉ đọc trên host cố định, kiểm tra shop, mã tham chiếu, người nhận và trường vận đơn đã gửi. Kết quả không tìm thấy không chứng minh chưa tạo và không mở khóa tự động. Cần người vận hành GHN điều tra nếu vẫn chưa rõ; không tự đổi key hoặc tạo thủ công trước khi đối chiếu.

Khi có mã provider, lưu REMOTE_CREATED trước rồi mới transaction ghi tracking + SUCCESS + audit. Audit/lưu local thất bại giữ bằng chứng để lần đọc sau chỉ hoàn tất local. Nếu quyền hoặc phạm vi đơn CRM thay đổi trước hoàn tất, giữ REMOTE_CREATED để người vận hành xử lý; không gắn sai dữ liệu. Trạng thái kinh doanh thay đổi sau khi GHN chấp nhận không ngăn ghi nhận vận đơn đã tồn tại: eligibility chỉ kiểm tra khi tạo mới, còn hoàn tất luôn kiểm tra lại quyền và phạm vi. Các thao tác này không đổi tiền, tồn kho hay trạng thái kinh doanh của đơn CRM.

UI chỉ giữ key không có PII trong sessionStorage theo user/phạm vi. Khi mở lại/new tab, chỉ khôi phục lượt IN_FLIGHT/UNKNOWN/REMOTE_CREATED để đối soát, giữ nguyên key và chặn tạo trùng. SUCCESS/REJECTED lịch sử không được hiện lại: mỗi lần mở vào form mới, reset trường standalone hoặc điền lại dữ liệu gốc của đơn CRM. Không tự tạo hoặc tự in khi mở trang.

Sau khi lượt hiện tại SUCCESS, popup riêng hiển thị mã, sao chép, In phiếu gửi A5, Tạo đơn mới và Đóng. In qua POST `/api/ghn-orders/:key/print`: server kiểm tra actor, quyền/phạm vi, SUCCESS và shop vẫn được phép; chỉ dùng mã đã lưu, gọi GHN gen-token trên host cố định rồi trả liên kết printA5. Người dùng bấm Mở phiếu in A5 để kiểm tra và in từ trình duyệt. Lỗi in cho thử lại, không tạo lại vận đơn. Endpoint riêng này không bật tính năng print_a5 generic của bảng theo dõi. Sửa/hủy vẫn xử lý trên cổng GHN. Không có migration mới cho thay đổi popup/in.

## Theo dõi, liên kết và in lại sau khi đóng popup

Bản Node local đã bổ sung endpoint canonical POST `/api/ghn-tracking/print` cho
vận đơn đã lưu. Nút in tại Theo dõi GHN và chi tiết Orders dùng luồng riêng này,
không bật generic `print_a5`. Server nhận ID, tự xác minh mã/shop/phạm vi, nhóm
theo cửa hàng và kiểm tra lại toàn bộ quyền/cấu hình trước khi trả các link A5.
Gỡ mã khỏi đơn chỉ tháo liên kết; xóa tracking là thao tác riêng và không hủy GHN.
Chi tiết kiểm chứng, giới hạn và preflight local:
`ghn-tracking-fixes-2026-10-23.md`. Đây chưa phải nghiệm thu provider/bản chính.

## Giới hạn

Địa chỉ hiện dùng danh mục tỉnh/quận/phường GHN; tên địa chỉ do server tra cứu và kiểm tra quan hệ, mã ward giữ nguyên chuỗi. Popup hỗ trợ gợi ý địa chỉ Goong khi được bật trong Cài đặt API; xem `ghn-address-recognition.md`. GHN lấy hàng tại địa chỉ shop; chưa hỗ trợ điểm gửi tùy chọn hoặc tự chuyển địa chỉ mới hai cấp sang mã GHN. Hỗ trợ service type 2/5 theo dịch vụ khả dụng, tối đa 50 kg, 200 cm mỗi chiều, COD 50 triệu, bảo hiểm 5 triệu. Mỗi vận đơn hiện dùng đúng một kiện đã cân, đo thực tế; số đo gốc và item giống nhau, không cộng/suy kích thước từ các sản phẩm. Phí cuối có thể thay đổi khi GHN cân đo.
