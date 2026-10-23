# Tối ưu luồng thiết lập, chấm công và tiền lương — 16/10/2026

Phạm vi: bảo toàn cấu hình lương theo ngày hiệu lực, chặn khóa kỳ còn đầu vào chưa xử lý, tránh phản hồi tải dữ liệu cũ, báo rõ lỗi tải và giảm truy vấn không cần thiết. Không bổ sung công thức lương hoặc sửa dữ liệu nghiệp vụ lịch sử.

## Thay đổi

- Khi duyệt cấu hình mới, giữ nguyên giá trị và khoảng ngày trên bản gốc, chuyển bản gốc sang `RETIRED`, tạo các đoạn tiếp nối đã duyệt cho phần hiệu lực còn lại. Tính ngày và sao chép tiền bằng PostgreSQL; lưu liên kết nguồn, audit và giữ ID snapshot cũ. Áp dụng cả duyệt bộ và duyệt lẻ cho phân công lương, hồ sơ lương, đơn giá, BHXH và đơn giá sản phẩm. Từ chối lịch sử đã duyệt đang giao ngày; không tự phục hồi phiên bản đã ngừng dùng.
- Preflight chỉ ra công, sản lượng, tăng ca chờ duyệt và khoản cộng/trừ còn nháp/chờ duyệt. Khóa kỳ kiểm tra lại toàn kỳ dưới khóa nguồn, kể cả nhân sự ngoài bộ lọc hoặc đã nghỉ. Có đường dẫn xử lý và hủy nháp có lý do; lỗi khi khóa làm mới danh sách cần xử lý.
- Chấm công cá nhân và chấm công quản lý bỏ phản hồi cũ khi đổi tháng/ngày. Hiển thị lỗi nguồn kéo dài kèm tải lại; ngăn xác nhận, xử lý và xuất Excel khi dữ liệu liên quan chưa đầy đủ. Tách tiền đã duyệt và tiền chờ duyệt, ghi rõ đây chưa phải bảng lương cuối kỳ.
- Đổi ngày trong cùng tháng không tải lại toàn bộ nguồn tháng; trang lương chỉ bật truy vấn cho mục đang sử dụng dữ liệu, giữ nguyên kiểm tra quyền.
- Hồ sơ lương chờ tất cả nguồn được cấp quyền tải thành công và hết tải lại trước khi mở/sửa/duyệt, tránh chụp giá trị mặc định từ danh sách chưa tải. Gửi công cá nhân kiểm tra cấu hình thuộc đúng ngày; liên kết lỗi phân biệt cơ sở chưa gán với lỗi không mang thông tin cơ sở.

Migration mới: `server/db/migrations/055_local_payroll_approval_continuations.sql`. Chỉ thêm cột tự tham chiếu và chỉ mục cho năm bảng phiên bản; không thay công thức hoặc backfill dữ liệu. Không sửa migration đã áp dụng.

## Kiểm chứng và trạng thái

Kết quả lệnh, manifest cuối và các cảnh báo build được ghi tại `payroll-flow-optimization-tests-2026-10-16.md`. Toàn bộ kiểm thử có thao tác tạo/duyệt/tính/khóa dùng database và role tạm riêng, chặn truy cập dịch vụ ngoài, rồi dọn tài nguyên của bộ kiểm thử.

Đã sao lưu database local trước thay đổi tại `../backups/crm-before-payroll-flow-20261016-183314.dump` (7.989.170 byte, PostgreSQL custom format, danh sách TOC hợp lệ).

Reviewer độc lập đã đối chiếu đủ 9/9 SHA256 của bản cuối; không còn finding P1/P2 chưa xử lý trong phạm vi. Bộ kiểm thử backend đạt: tối ưu 13/13, đơn giản hóa 15/15, chính sách 12/12, toàn vẹn 10/10, phân quyền 22/22 (tổng 72/72); golden V2 và kiểm tra phạm vi/đồng thời đều đạt.

TypeScript app/server, lint phạm vi sửa, build server và build giao diện `envDir:false` đều đạt. Sau khi phát hiện `Object.hasOwn` chưa tương thích thư viện TypeScript của app, đã đổi sang `Object.prototype.hasOwnProperty.call` và chạy lại TypeScript/lint/build giao diện thành công trên hash cuối `507E476B…D4040`. Đầu ra build cuối: `C:\Users\Lenovo\AppData\Local\Temp\crm-payroll-flow-final-build-pG4udk`. Còn cảnh báo Browserslist cũ và chunk lớn; chưa đo tải lớn. Chi tiết lệnh nằm trong báo cáo kiểm thử riêng.

API local đã được khởi động lại sau kiểm thử backend và rà soát bản cuối; bộ lập lịch đồng bộ ra ngoài tắt. `/health` trả `ok:true`, backend `local-postgresql`, database `crm_local`. Migration 055 có trạng thái `APPLIED`, checksum khớp tệp; xác nhận đủ 5 cột, 5 khóa ngoại tự tham chiếu và 5 chỉ mục. Không tạo/duyệt/tính/khóa bản ghi kinh doanh để thử nghiệm.

UI `http://127.0.0.1:8090/payroll-settings` trả HTTP 200; API ở cổng 8787. Vite hiện có tiếp tục phục vụ giao diện, chỉ tiến trình API của dự án được khởi động lại. Đây là kiểm tra HTTP, không phải QA trình duyệt tương tác.

## Giới hạn

- Chưa kiểm tra giao diện tương tác mới trên trình duyệt trong đợt này; dùng kiểm tra mã, TypeScript, lint, build và API/SQL cô lập. Không suy diễn kết quả UI của đợt trước thành kết quả của thay đổi này.
- Không tự sửa các phiên bản lịch sử đã bị ngừng dùng từ trước; trường hợp đó cần đối soát riêng.
- Chưa triển khai dashboard công việc tập trung, nhập thông tin ngân hàng từ hồ sơ, công thức nghỉ hưởng lương/ngày lễ hoặc file chuyển khoản.
- Chỉ cập nhật local; chưa commit, đẩy GitHub hay triển khai VPS. Các thay đổi có sẵn ngoài phạm vi được giữ nguyên.
