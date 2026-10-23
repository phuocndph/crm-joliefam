# Kế hoạch chuẩn hóa luồng tính lương và giảm thao tác

Ngày 16/10/2026. Đây là kế hoạch cho **bước tiếp theo** sau hai đợt đơn giản hóa/tối ưu đã hoàn tất ở mã local (`payroll-simplification-report-2026-10-16.md`, `payroll-flow-optimization-report-2026-10-16.md`). Chưa đổi công thức, dữ liệu lương, quyền hay trạng thái kỳ bằng tài liệu này.

## Hiện trạng và vấn đề còn lại

Luồng hiện có: nhân viên khai hồ sơ → quản lý duyệt và liên kết worker → tạo bộ cấu hình lương nháp → đối chiếu/duyệt phiên bản → ghi công/sản lượng/tăng ca → duyệt nguồn và khoản cộng/trừ → preflight → preview → đối soát → khóa kỳ → xuất CSV. Duyệt bộ, bảo toàn lịch sử hiệu lực, preflight toàn kỳ, dấu nguồn và bất biến sau khóa đã có; **không làm lại** các cơ chế này.

Giao diện đã rút còn 3 mục chính nhưng mỗi mục vẫn có 2–4 lối phụ. Màn `Bảng lương tháng` đồng thời chứa chọn kỳ, lịch công, 2 nút kiểm tra/tính thử, lỗi nguồn, thống kê, lịch sử, bảng đối soát 12 cột rộng tối thiểu 1.600 px và hộp khóa. File nhập Excel xuất hiện ở đầu mọi mục. Người quản lý phải tự ghép nhiều màn để biết việc nào đến lượt mình; lỗi chặn có liên kết nhưng chưa có một hàng đợi công việc theo kỳ/người/trách nhiệm. `Nhân sự & mức lương` vẫn phụ thuộc nhiều danh sách chung trước khi mở một hồ sơ. Đây là điểm rối còn lại, khác với những lỗi an toàn dữ liệu đã sửa.

Về nghiệp vụ, engine local đang chặn có chủ ý: nghỉ hưởng lương (`UNSUPPORTED_PAID_LEAVE`), công thường ở ngày lễ và quyết toán người nghỉ/tạm dừng có khoản cố định (`SETTLEMENT_RECURRING_UNRESOLVED`). Đặc tả đã có hướng tính ngày đặc biệt, nhưng mức áp dụng/điều kiện cụ thể và xử lý quyết toán chưa được đưa đầy đủ vào engine; không tự lấy một mức chung hoặc bỏ qua lỗi. Sau `LOCKED`, CRM hiện xuất CSV, chưa có trạng thái chi trả/đối soát chuyển khoản. Tài khoản ngân hàng có nháp/xác minh riêng; khóa bảng lương không có nghĩa đã trả tiền.

Số liệu chỉ để định cỡ màn hình: database local tại lúc rà soát có 43 worker, 8 kỳ, 20 run, 12 phiếu `SUBMITTED` thuộc công/sản lượng/tăng ca ở các ngày khác nhau. Có thể có dữ liệu kiểm thử; không xem đây là danh sách việc thực tế của kỳ đang làm. Hàng đợi phải lọc theo kỳ, cơ sở, quyền và nguồn hợp lệ trên máy chủ.

## Luồng đích

```text
Thiết lập một lần hoặc khi thay đổi
Hồ sơ nhân sự → Hồ sơ lương nháp → Duyệt đúng phiên bản/ngày hiệu lực
                                      ↓
Hằng ngày: ghi công/sản lượng/tăng ca → quản lý xử lý nguồn chờ và ngoại lệ
                                      ↓
Theo tháng: Chọn kỳ/cơ sở → Việc cần xử lý → Tính thử & đối soát → Khóa
                                                               ↓
                                                Chuẩn bị chi trả → Xác nhận đã trả
```

### Một trang điều hành kỳ lương

Giữ ba mục chính hiện có. Trong `Bảng lương tháng`, chỉ hiện **một thao tác chính phù hợp trạng thái**: `Kiểm tra và tính thử` khi chưa có preview hợp lệ; `Đối soát bản tính` khi đã có preview; `Khóa kỳ` khi đã hết chặn và người dùng có quyền. `Kiểm tra dữ liệu` là thao tác phụ. Nhóm công việc theo **Cấu hình/lịch**, **Nguồn công và sản lượng**, **Khoản cộng/trừ**, **Ngoại lệ đối soát**, mỗi nhóm có số lượng, mức chặn, người chịu trách nhiệm, người/ngày nguồn, nút xử lý và đường trở về đúng kỳ/cơ sở. Không tự duyệt hay tự bỏ qua nguồn.

Một lỗi chỉ xuất hiện một lần trong hàng đợi dù có mặt ở `issues` và `lock_issues`; nguồn ngoài phạm vi preview vẫn hiện cảnh báo **chặn khóa toàn kỳ**. Trạng thái “sẵn sàng” chỉ lấy từ preflight mới nhất của đúng kỳ/phạm vi và hết hiệu lực ngay khi nguồn/cấu hình thay đổi. Hàng đợi là phép chiếu đọc từ nguồn hiện có, **không** tạo bảng ghi công/duyệt thứ hai. Lịch sử run và nhập Excel đặt trong phần mở rộng `Lịch sử & công cụ`, không chiếm đầu màn làm việc thường ngày.

### Một hồ sơ lương theo nhân sự

Danh sách nhân sự chỉ hiện tên/mã, cách trả, hiệu lực, nháp cần duyệt và trạng thái cần xử lý. Mở một người mới tải chi tiết của người đó theo quyền, thay vì chờ toàn bộ danh sách phụ. Biểu mẫu 3 bước hiện có giữ lại nhưng chỉ hiển thị trường liên quan đến hình thức lương và khoản đã bật; phần `Lưu thay đổi nhân sự áp dụng ngay` và `Lưu cấu hình lương thành nháp` phải được trình bày tách bạch. Khi duyệt, hiển thị **trước → sau**, ngày hiệu lực, ID bộ phiên bản, lý do và tác động đến khoảng hiệu lực cũ. Dùng API duyệt bộ nguyên giao dịch đã có. Các quyền hạn chế vẫn sửa được đúng phần được cấp, không phải đủ mọi quyền để xem một nhân sự.

Thông tin ngân hàng nhân viên tự khai chỉ là đề nghị đối chiếu: kế toán/nhân sự xem khác biệt, tạo nháp tài khoản nhận lương rồi xác minh qua quy trình hiện hữu; không tự chuyển dữ liệu tự khai thành tài khoản `VERIFIED`.

### Đối soát lương trước khóa

Mặc định là bảng gọn: nhân sự, lương chính, tăng ca/sản lượng, khoản khác, khấu trừ, thực nhận, **chênh lệch so với preview trước** và cảnh báo. Mở chi tiết mới thấy từng item, nguồn, ngày, đơn giá/chính sách snapshot và lý do. Cho lọc `có thay đổi`, `bất thường`, `thu nhập âm/0`, `thiếu tài khoản xác minh để chuẩn bị trả`, nhưng thiếu ngân hàng không tự thành lỗi chặn **tính** lương. Hiển thị tổng bằng giá trị `numeric` do server tổng hợp từ snapshot; không cộng tiền duyệt/đối soát bằng `Number` JavaScript. Tổng số người, tổng thu nhập, khấu trừ và số tiền thanh toán phải khớp CSV của đúng run.

Khóa giữ preflight, fingerprint, kiểm tra toàn kỳ, quyền, transaction và idempotency hiện có. Hộp khóa cần nói rõ phạm vi preview, số người có nguồn ngoài phạm vi, các ngoại lệ đã xử lý, số liệu đối soát và lần cập nhật cuối. Nếu dữ liệu đổi, quay lại hàng đợi rồi tính preview mới. `LOCKED` là **chốt kết quả**, không phải lệnh chuyển tiền.

## Quy tắc nghiệp vụ cần chốt trước khi mở rộng engine

| Chủ đề | Quyết định cụ thể cần chốt | Ranh giới thực hiện |
|---|---|---|
| Nghỉ hưởng lương | Đối tượng, số ngày/đơn vị hưởng, mức hưởng theo loại lương, giới hạn, nguồn duyệt và xử lý ngày có công/tăng ca cùng lúc | Có rule phiên bản theo ngày/cơ sở/nhóm, không tính như ngày công thường nếu chưa được duyệt |
| Ngày lễ và Chủ nhật | Trả lương ngày thường, lương làm ngày đặc biệt và khoản thưởng có cộng dồn hay thay thế; ca/giờ áp dụng; nguồn xác nhận ngày | Mỗi phút/ngày chỉ tạo đúng item theo rule, chặn trùng trả |
| Người nghỉ/tạm dừng giữa kỳ | Phân bổ hoặc ngừng phụ cấp cố định, khấu trừ cố định, BHXH; ngày hiệu lực; quyết toán khoản còn treo | Không mặc định trừ/cộng đủ tháng; dùng case vàng cho nghỉ đầu/giữa/cuối kỳ |
| Sau khóa | Sai công/thiếu thưởng/khoản truy thu được bù kỳ sau hay kỳ phụ; ai lập, ai duyệt, cách ghi nguồn và đối soát | Bản khóa bất biến; tạo điều chỉnh/off-cycle có liên kết kỳ gốc và audit |
| Phê duyệt hàng loạt | Ngưỡng nào được duyệt theo lô, dữ liệu nào phải xem riêng; người nhập và người duyệt có phải khác nhau | Không tự duyệt tiền/sản lượng bất thường chỉ để giảm số lượt bấm |
| Chi trả | Tài khoản cần `VERIFIED`, định dạng ngân hàng, số tiền làm tròn, xử lý chuyển khoản lỗi và bằng chứng đã trả | Chỉ triển khai sau khi quy trình khóa/đối soát ổn định; trạng thái thanh toán tách khỏi `LOCKED` |

Với mỗi quyết định, nghiệp vụ bàn giao một bảng ví dụ **đầu vào → kết quả kỳ vọng → người duyệt**; gồm biên ngày hiệu lực, trường hợp đồng thời và sửa sau khóa. Không mở khóa chặn hiện tại bằng lựa chọn mặc định tạm thời.

## Thứ tự triển khai

| Đợt | Phạm vi và kết quả bàn giao | Tác động dữ liệu | Điều kiện nghiệm thu |
|---|---|---|---|
| 1 — Bàn làm việc theo kỳ | Hàng đợi theo kỳ/cơ sở/quyền, một nút chính, lỗi dẫn đúng nơi và quay lại, lịch sử/nhập Excel đưa ra phần nâng cao. Kiểm tra bàn phím/mobile, trạng thái tải/lỗi/thử lại. | Chủ yếu UI và API đọc tổng hợp từ nguồn hiện có; không đổi công thức/schema. | Quản lý mở kỳ thấy ngay việc của mình; xử lý một nguồn rồi quay lại đúng kỳ; không xem nhầm quyền/số liệu cũ. |
| 2 — Hồ sơ và đối soát gọn | Tải chi tiết một worker, so sánh phiên bản trước/sau; bảng preview gọn, so sánh với preview trước, giải thích item và tổng `numeric` từ server. | API đọc/snapshot đã có; migration chỉ nếu thiếu liên kết bất biến cho đối chiếu. | Thiết lập/duyệt một người từ một lối; tổng từng người/tổng kỳ/CSV bằng nhau; đổi preview không dùng dữ liệu cũ. |
| 3 — Quy tắc còn chặn | Chốt bảng quyết định trên, thêm các rule cần thiết cho nghỉ phép/ngày đặc biệt/người nghỉ và điều chỉnh sau khóa. | Migration append-only cho policy/nguồn điều chỉnh nếu cần; giữ snapshot khóa cũ. | Bộ case vàng và tháng mẫu khớp kết quả owner duyệt; không double pay; ca thiếu rule vẫn chặn rõ. |
| 4 — Chuẩn bị và xác nhận chi trả | Danh sách thanh toán từ run khóa, chỉ tài khoản xác minh, xuất file phù hợp ngân hàng, ghi lần chuyển khoản/thất bại/đã trả và đối soát. | Trạng thái/payment ledger riêng, permission/audit/migration riêng. | Tổng file = tổng tiền phải trả của bản khóa; retry không tạo hai lần thanh toán; khóa kỳ không tự đổi thành đã trả. |

Đợt 1–2 có thể bắt đầu với các rule hiện hữu. Đợt 3 phụ thuộc quyết định nghiệp vụ; đợt 4 phụ thuộc mẫu file và quy trình ngân hàng thực tế. Không đưa tính năng duyệt hồ sơ cá nhân, duyệt cấu hình lương và duyệt chi trả vào cùng một nút.

## Phạm vi kỹ thuật và kiểm chứng

Mã chính dự kiến: `src/pages/PayrollSettingsPage.tsx`, `src/components/PayrollVersionSettings.tsx`, `src/components/AttendanceWorkspaceV2.tsx`, `src/pages/MyAttendancePage.tsx`, `src/components/ProfileReviewPanel.tsx`, `server/index.ts`, `server/payroll-rules.ts`, `server/payroll-snapshot.ts`. Có thể tách giao diện theo mục/chi tiết người để giảm độ lớn `PayrollSettingsPage.tsx`; không tạo thêm nguồn tiền lương độc lập. Thay đổi database đi bằng migration mới, không sửa migration 052–055 đã áp dụng local.

Mỗi đợt cần kiểm tra quyền theo vai trò, cơ sở và người; audit; retry/idempotency; hai thao tác đồng thời; ngày hiệu lực ở biên; preview cũ sau nguồn đổi; khóa kỳ có người ngoài bộ lọc; độ chính xác `numeric`; xuất CSV; trạng thái trống/lỗi mạng/đổi tháng nhanh; 375/768/1440 px và bàn phím. Các ca tạo/duyệt/tính/khóa chạy trong database cô lập và so với bộ golden V2 + policy/integrity/simplification/optimization hiện có. Trước khi dùng kỳ thật, chạy **song song một kỳ** với bảng đối soát hiện hành, ký xác nhận chênh lệch và kế hoạch phục hồi; không cập nhật lịch sử khóa cũ.

Ưu tiên triển khai: **đợt 1 → đợt 2**, đồng thời chốt ví dụ nghiệp vụ cho đợt 3. Điều này giảm thao tác ngay mà không thay đổi kết quả lương khi các quy tắc chưa đủ bằng chứng.
