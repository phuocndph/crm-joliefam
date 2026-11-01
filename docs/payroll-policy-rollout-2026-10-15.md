# Cấu hình payroll v3 và giới hạn triển khai

Thay đổi này bổ sung migration `053_local_payroll_rules_calendars.sql`, phụ thuộc `052_local_payroll_snapshot_integrity.sql`. Chưa áp dụng hai migration vào cơ sở dữ liệu cục bộ đang dùng hoặc VPS; chưa chuyển dữ liệu, triển khai hay sửa run hiện hữu.

## Thiết lập trước khi tính kỳ mới

1. Sau khi được duyệt triển khai, áp dụng lần lượt migration chưa chạy trong môi trường mục tiêu qua quy trình migration của dự án. Sao lưu và kiểm tra riêng trước khi tác động dữ liệu kinh doanh.
2. Mở `/payroll-settings?tab=policies` ở backend local. Trong **Chính sách tính lương và lịch công đã duyệt**, quản trị viên hoặc quản lý có quyền `payroll_policy_manage` tạo nháp và duyệt. Kế toán có quyền xem, không được chỉnh cấu hình.
3. Tạo lịch cho đúng ngày đầu/cuối kỳ, từng mã cơ sở: ngày công chuẩn và phút công mỗi ngày. Dùng `__UNASSIGNED__` cho nhân sự chưa gán cơ sở. Không có mặc định 26 ngày hoặc 8 giờ.
4. Tạo quy tắc OT theo nhóm, cơ sở và khoảng ngày bắt buộc, với loại NORMAL/SUNDAY/HOLIDAY. Chọn đơn giá giờ cố định hoặc đơn giá cơ sở nhân hệ số. Phương pháp cố định không yêu cầu lương cơ sở. Phương pháp hệ số ưu tiên mức giờ duy nhất; nếu dùng lương tháng thì chia ngày chuẩn và giờ chuẩn của lịch đã duyệt.
5. Tạo tiền ăn theo nhóm, cơ sở, khoảng ngày và mức tiền được doanh nghiệp xác nhận. Cơ sở để trống áp dụng toàn bộ nhóm; không cho phép phiên bản chung giao với phiên bản riêng trong cùng ngày. Không seed mức tiền/hệ số ngầm.
6. Kiểm tra `/payroll-settings?tab=runs`. Lịch đã duyệt hiển thị theo kỳ. Ô ngày chuẩn đối chiếu chỉ là kiểm tra tùy chọn: nếu nhập phải khớp mọi lịch có liên quan, không thay lịch. Kiểm tra lỗi chặn, tạo preview mới, đối soát rồi khóa.

POST/PATCH/DELETE `/api/payroll/{rule-versions|calendar-versions}` quản lý nháp; POST `/:id/approve` yêu cầu lý do. Mọi thay đổi và audit dùng cùng giao dịch với người thao tác thực. Bản đã duyệt không sửa/xóa, kể cả SQL trực tiếp; ngày/phạm vi giao nhau bị từ chối khi duyệt. Các quy tắc cũ chỉ còn phục vụ lịch sử, engine v3 không dùng làm giá trị dự phòng. Các trường 26 ngày còn trong luồng tương thích mức lương/điều chỉnh cũ không được dùng làm mẫu số tính v3.

## Phạm vi nhân sự và các trường hợp cần đối soát

Nhân sự đang hoạt động có thời gian làm việc giao kỳ hoặc có nguồn đã duyệt chưa thanh toán được đưa vào phạm vi. Nguồn bao gồm công, sản lượng, OT, ngày đủ điều kiện ăn, nghỉ hưởng lương chưa hỗ trợ và điều chỉnh đúng kỳ; vì vậy người đã nghỉ/tạm dừng có nguồn không bị âm thầm bỏ sót. Khóa preview có phạm vi lọc vẫn kiểm tra người thực còn nghĩa vụ ngoài phạm vi.

Hồ sơ nguồn và phân loại phải duy nhất tại từng ngày nguồn. Nguồn ngoài thời gian làm việc hoặc nguồn đã duyệt ở ngày tắt sản lượng/OT/ăn là lỗi chặn; không âm thầm tính bằng không. Đổi cờ giữa kỳ được hỗ trợ nếu mọi nguồn phát sinh nằm ở các ngày được bật.

Chưa tự tính BHXH, phụ cấp và khấu trừ cố định theo tỷ lệ cho nhân sự đã nghỉ/tạm dừng hoặc hết việc giữa kỳ. Khi có cấu hình định kỳ chồng thời gian, hệ thống chặn bằng `SETTLEMENT_RECURRING_UNRESOLVED` để doanh nghiệp xác nhận quyết toán; không tự thu đủ tháng. Nghỉ hưởng lương và công thường trên ngày đánh dấu HOLIDAY cũng chặn vì chưa có công thức lương riêng được duyệt. Chủ nhật không bị chặn mặc định; OT Chủ nhật cần quy tắc SUNDAY rõ ràng.

## Lịch sử và bảo toàn snapshot

Preview mới dùng `local-payroll-v3` và fingerprint phiên bản 2, gồm cấu hình, lịch, phạm vi và nguồn. Preview cũ phải tính lại trước khi khóa. Run đã khóa vẫn đọc/xuất snapshot cũ, không tính lại hoặc tự chuyển đổi.

Mỗi record mới lưu mã, tên, loại nhân sự và cơ sở tại thời điểm tính. Record/items/run đã khóa bất biến; thay tên/mã/cơ sở trong hồ sơ không đổi báo cáo lịch sử. Record cũ không có snapshot định danh vẫn dùng hồ sơ hiện tại và gắn nhãn `LEGACY_UNSNAPSHOTTED` trong API, CSV và giao diện. Không thể khôi phục chính xác định danh quá khứ nếu chưa có nguồn đối soát; không tự backfill dữ liệu phỏng đoán.

Fingerprint hiện bao gồm toàn bộ danh mục và phiên bản cấu hình, kể cả nháp, nên thay đổi cấu hình không liên quan vẫn có thể buộc preview mở tính lại. Đây là cơ chế bảo thủ được giữ lại để bảo toàn nhất quán.

## Kết quả kiểm chứng bản sửa

Đã kiểm tra trên database dùng một lần, tài khoản database hạn chế quyền và chặn kết nối ra ngoài; không dùng dữ liệu kinh doanh để thử tính hoặc khóa lương.

- `node scripts/test-payroll-policies-isolated.mjs`: 12/12 nhóm đạt, gồm quy tắc theo ngày/loại OT/cơ sở, lịch công, nhân sự đã nghỉ còn nguồn, cấu hình chồng lấn, audit và bất biến.
- `node scripts/test-payroll-integrity-isolated.mjs`: 10/10 nhóm đạt; các chế độ `--v2` và `--scope-concurrency` đều đạt.
- `node scripts/test-permissions-isolated.mjs`: 22/22 đạt.
- TypeScript ứng dụng và máy chủ, ESLint cho phạm vi sửa, build máy chủ và frontend đều đạt. Frontend QA được build với `envDir:false`, không đọc `.env`. Build còn cảnh báo Browserslist và kích thước chunk.
- Reviewer kiểm tra lại sau một vòng sửa nguồn công cũ `attendance_method=OUTPUT`: không còn phát hiện cần sửa. Nguồn này hiện bị chặn rõ ràng bằng `LEGACY_OUTPUT_ATTENDANCE_SOURCE` thay vì bị bỏ sót khi tính.
- Giao diện: quản trị viên tạo và duyệt lịch tháng 02/2025 (24 ngày, 480 phút/ngày); bản đã duyệt mất thao tác sửa/xóa. Quản lý kiểm tra đầu vào, tạo preview cho một nhân sự giả có lương tháng 2.400.000đ và một ngày công: kết quả 100.000đ; khóa thành công và giữ tên/mã nhân sự trong chi tiết. Đây là dữ liệu kiểm thử, không thực hiện chuyển tiền.
- Giao diện kế toán xem được cấu hình nhưng không có nút tạo/duyệt; tài khoản nhân viên bị từ chối truy cập quản lý lương.

Bằng chứng giao diện lưu ngoài mã nguồn tại `../outputs/payroll-policy-approved-ui.png` và `../outputs/payroll-policy-locked-ui.png`. Chưa chạy kiểm thử responsive/mobile riêng cho phần giao diện mới.

Bản sửa hiện là diff cục bộ, chưa commit/push. Migration 052 và 053 vẫn chưa áp dụng vào database cục bộ đang dùng hay VPS. Trước khi dùng thực tế cần duyệt lịch công, mức tiền ăn và quy tắc OT theo chính sách doanh nghiệp; các giá trị trong QA không phải cấu hình đề xuất cho vận hành.

### Dọn môi trường QA

API và frontend QA cổng 62405 đã dừng; không còn tiến trình hoặc phiên database của fixture. Phiên làm việc bị reset trước khi hoàn tất `finally`, nên còn database `payroll_integrity_qa_16400_1792079828236`, role `payroll_integrity_role_16400_1792079828236` và thư mục tạm `C:/Users/Lenovo/AppData/Local/Temp/crm-payroll-policy-ui-7ST8t1`. Tester đã đối chiếu owner và các sentinel nhân sự/tài khoản giả trước khi dọn. Bộ xét duyệt tự động từ chối lệnh xóa với lý do “blocked by policy”; không có lệnh xóa nào được thực hiện. Các tài nguyên này cần được dọn sau qua thao tác được cho phép; không phải database kinh doanh.


## Làm rõ chọn cơ sở tính tăng ca — 29/10/2026
Quy tắc “ưu tiên mức giờ” ở phần hướng dẫn cũ chỉ áp dụng trong cơ sở lương phù hợp, không cho phép đơn giá HOUR không liên quan ghi đè cơ sở lương tháng. Với phân loại hiệu lực MONTHLY_MANAGER hoặc MONTHLY_HELPER, chọn đúng một mức DAY đã APPROVED, hiệu lực tại ngày nguồn và có compensation_type khớp chính phân loại đó. Thiếu hoặc nhiều mức phù hợp thì chặn; không rơi sang HOUR. Với HOURLY, chọn đúng một mức HOUR đã APPROVED/hiệu lực và compensation_type=HOURLY. Mức chọn phải dương.
Đường HOUR hiện có của PIECE_RATE/loại cũ khác được giữ nguyên để tránh đổi chính sách chưa được xác nhận; đây không phải xác nhận nghiệp vụ cho các trường hợp đó. Công thức V3 vẫn lấy mức tháng chia ngày chuẩn và giờ chuẩn từ lịch đã duyệt; resolver legacy vẫn dùng công thức riêng hiện có. Không đổi phép chia, làm tròn, công thức tiền, DTO, phân quyền, snapshot hay run đã khóa.
Đã nghiệm thu phạm vi qua 21 ca pure, 13 ca PostgreSQL và golden tài chính nguyên byte: 3 run × 3 records, gross 6224230.769231; khấu trừ 1000000; thanh toán 5224231; OT snapshot DAY/26 ngày/480 phút/hệ số 1.5. Test V2 đối chiếu riêng từng công thức gốc bằng numeric equality chính xác. Historical FAIL và V1 harness FAIL giữ nguyên; không suy diễn đã tái dựng bước lỗi V1. API/pool/container QA đã dọn, tiến trình root exit=0; không ghi dữ liệu nguồn hoặc chứng minh parity toàn hệ thống.
Việc tự tạo đơn giá APPROVED/mức dự phòng khi thêm nhân sự vẫn NOT_FIXED và cần xử lý riêng. Chưa kích hoạt vận hành: 5/5A INCOMPLETE, mục 6 NOT_OPENED, activation=false, pay_ready=false; luồng chọn mã sửa rèm thủ công chưa triển khai.
