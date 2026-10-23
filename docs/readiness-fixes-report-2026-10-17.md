# Hoàn thiện hồ sơ, chấm công và thiết lập lương

Ngày 17/10/2026. Thực hiện theo yêu cầu triển khai sau báo cáo `payroll-attendance-readiness-audit-2026-10-17.md`.

## Đã triển khai

| Hạng mục | Kết quả |
|---|---|
| Duyệt đúng hồ sơ đã xem | API trả revision dạng chuỗi; duyệt và yêu cầu bổ sung đều bắt buộc gửi expected_revision. Máy chủ khóa và so sánh phiên bản trước khi thay đổi hồ sơ, liên kết hoặc audit. Hồ sơ đổi trả 409; UI đóng bản cũ, tải lại danh sách và yêu cầu mở xem lại. Không tự áp dụng quyết định lên bản mới. |
| Thử lại tăng ca | Khóa chống trùng gắn với nội dung chuẩn hóa và worker. Giữ khóa khi gặp lỗi hoặc chuyển ngày rồi quay lại nội dung đang chờ; chặn gửi đồng thời bằng ref. Khi xác nhận thành công mới tiêu thụ khóa. Bảo vệ phản hồi khi rời màn hình/đổi phiên, không xóa lý do mới nhập trong lúc chờ. |
| Kiểm tra dữ liệu nhân sự | Dùng chung kiểm tra ngày thực, ngày nghỉ không trước ngày vào, trạng thái hợp lệ và đã nghỉ phải có ngày nghỉ. Áp dụng phía server cho PATCH, lưu bộ hồ sơ lương và nhập NHAN_SU từ Excel; hai form UI dùng chung kiểm tra tương ứng. |
| Cập nhật nhân sự và audit | PATCH yêu cầu lý do, khóa cấu hình/worker theo thứ tự hiện có và cập nhật cùng audit trong một transaction. Audit lỗi thì rollback cả master. PATCH giữ trường bỏ qua và cho phép null để xóa; bundle giữ cách thay thế đầy đủ vốn có; Excel giữ giá trị khi bỏ trống cột. Không áp constraint mới lên dữ liệu cũ. |
| Sửa công bị từ chối | “Sửa & gửi lại” chuyển sang tab Hôm nay, giữ ngày/tháng của dòng cần sửa và đưa focus tới biểu mẫu khi ngữ cảnh ngày đã sẵn sàng. |
| Lỗi thu nhập và xác nhận công | Lỗi tải thu nhập vẫn hiển thị nhưng không khóa riêng bước xác nhận công. Lỗi nguồn công, sản lượng, tăng ca, trạng thái/xác nhận ngày hoặc summary vẫn chặn khi thiếu dữ liệu. |
| Bộ lọc hàng chờ | DAY và QUEUE dùng chung predicate phương thức/trạng thái, bao gồm tăng ca chờ duyệt. Hàng chờ vẫn chỉ có ngày đã ghi nhận/cần sửa và chưa chốt; lựa chọn xem ngày đã chốt/chưa ghi nhận có lời giải thích dẫn sang tab thích hợp. |
| Preview duyệt hàng loạt | Bỏ phản hồi cũ theo generation, phiên và phạm vi; lưu snapshot tháng, worker, nhãn, fingerprint và khóa đã xem. Xác nhận gửi đúng snapshot đó; không ghép số liệu cũ với phạm vi hiện tại. Phạm vi duyệt vẫn là tháng + tổ + tìm người, được ghi rõ độc lập với bộ lọc hiển thị. |
| Lỗi tải hồ sơ | Hiện lỗi và nút thử lại riêng cho danh sách hồ sơ/danh sách công nhân; không diễn giải lỗi tải thành danh sách rỗng. Chặn gửi quyết định lặp. |
| Mặc định lương nâng cao | Bỏ tự điền 12480 phút và ví dụ ngầm định 26 ngày; người quản lý nhập căn cứ đã chọn. Không thay đổi công thức lương V3 hay tự đặt lịch làm. |

## Phạm vi tệp và review

Sửa 7 tệp production hiện có: `server/index.ts`, `src/lib/local-api.ts`, `src/lib/attendance-workspace.ts`, `src/components/ProfileReviewPanel.tsx`, `src/components/AttendanceWorkspaceV2.tsx`, `src/pages/MyAttendancePage.tsx`, `src/pages/PayrollSettingsPage.tsx`.

Thêm 3 helper production: `server/payroll-worker-master.ts`, `src/lib/attendance-retry.ts`, `src/lib/payroll-worker-validation.ts`.

Test mới: `scripts/test-payroll-readiness-isolated.mjs`, `scripts/test-readiness-helpers.mjs`; harness `scripts/test-payroll-integrity-isolated.mjs` thêm nhánh readiness. Không thêm/sửa migration, không commit/push hoặc triển khai VPS. Giữ nguyên các thay đổi có sẵn ngoài phạm vi.

So sánh riêng với baseline đầu lượt tại `.local-staging-runtime/readiness-fixes-20261017/baseline/`. Manifest 10 file cuối tại `.local-staging-runtime/readiness-fixes-20261017/frozen-manifest.json`; server SHA256 `318957B9ED69F192C1A1E4DB474B0413F5237D77452E56283C9A3BA61065FC70`. Có một vòng sửa được chấp nhận để đưa revision vào đúng SELECT khóa hồ sơ; reviewer rà lại đúng hash cuối và không còn phát hiện cần sửa.

## Kiểm chứng

- **90 nhóm kiểm thử PASS:** readiness 16, helper 4, attendance 16, simplification/bundle 15, console 13, closure/import 26.
- TypeScript app/server, lint trong phạm vi sửa, diff check, build server và frontend đều PASS. Frontend build độc lập dùng `envDir:false`; cảnh báo Browserslist/chunk lớn vẫn tồn tại.
- Mỗi suite API dùng DB/role riêng không có quyền superuser, cổng loopback ngẫu nhiên, xác thực thật của hệ thống và chặn hosted fetch. Đã dọn tài nguyên QA của lượt này. Một DB/role QA cũ tồn trước lượt kiểm thử được giữ nguyên, ghi rõ trong báo cáo test.
- Dữ liệu local kiểm tra bằng count + MD5 toàn dòng giữ nguyên trước/sau triển khai: attendance 46 / `1b5871cc822c0f056f42637556daeb0b`; production 4 / `b562d5b7deb9429666accfa6a6899fd3`; overtime 7 / `fa7f91142070a7230ec2087d66329ef9`; workers 43 / `aa5002a4e4763b21962cb1ed5ef06cd9`; profile forms 2 / `4bb4527ce7e2fea888a121dce7c6c774`.
- Lúc kết thúc, runtime local có sẵn đang phản hồi: API 8787 `/health` báo local-postgresql/crm_local; UI 8090 `/my-profile` HTTP 200. Các process này xuất hiện trong lúc kiểm thử nhưng không do coordinator/tester khởi chạy; đã giữ nguyên, không dừng/restart. Không dùng health HTTP 200 làm bằng chứng nghiệm thu tính năng.

Lệnh, bằng chứng và giới hạn chi tiết ở `readiness-fixes-tests-2026-10-17.md`.

## Chưa hoàn thành

1. **Nghiệm thu tương tác giao diện:** chưa trực tiếp kiểm chứng focus khi sửa, lỗi thu nhập riêng phần, nhấn nhanh, phản hồi bulk preview chậm khi đổi phạm vi/rời màn hình, responsive và bàn phím của các form mới. Công cụ trình duyệt ở lượt trước bị chính sách URL từ chối; không dùng controller khác để vượt chặn. Test helper và API không thay thế nghiệm thu React qua trình duyệt.
2. **Đầu vào nghiệp vụ còn thiếu:** lịch ca/làm nghỉ; nửa ngày/nghỉ hưởng lương/ngày lễ; phân bổ phụ cấp/BHXH/khấu trừ khi quyết toán giữa tháng; điều chỉnh bù kỳ sau/kỳ phụ; mẫu ngân hàng và đối soát chi trả. Người dùng đã hẹn gửi nhưng chưa nhận nội dung cụ thể. Giữ nguyên các guard tính lương hiện có, không dùng ví dụ trong tài liệu làm quy chế.
3. **VPS/public:** chưa triển khai hoặc thay đổi hệ thống online. Phạm vi lượt này là mã local và kiểm thử cô lập.
