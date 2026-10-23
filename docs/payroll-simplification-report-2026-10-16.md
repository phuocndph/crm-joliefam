# Kết quả đơn giản hóa tiền lương — 16/10/2026

Đã triển khai ba mục chính: **Bảng lương tháng**, **Nhân sự & mức lương**, **Thiết lập chung**. Bản mã đã qua hai vòng sửa và rà soát độc lập; manifest cuối gồm 19 tệp, được reviewer đối chiếu SHA256. Chưa commit, push hoặc cập nhật VPS.

## Thay đổi

- Mặc định vào kỳ lương tháng; bốn bước chọn kỳ/phạm vi, hoàn thiện đầu vào, tính thử/đối soát, khóa/xuất. Kết luận sẵn sàng dựa trên preflight máy chủ đúng kỳ, hết hiệu lực khi dữ liệu/phạm vi thay đổi.
- Hồ sơ lương theo ba bước; nói rõ thông tin nhân sự áp dụng ngay khi lưu, phiên bản lương chờ duyệt. Người có quyền hạn chế vẫn truy cập danh mục phù hợp.
- Đối chiếu mức cũ → mới và chọn chính xác ID phiên bản cùng khoảng hiệu lực. Duyệt bộ trong một transaction, có fingerprint chống nội dung cũ, audit và receipt cho retry; không quét duyệt mọi nháp của nhân viên.
- Quản lý không có quyền BHXH được giữ cấu hình bảo hiểm đã duyệt; bundle từ chối cả thay đổi ngầm thông qua nháp của người khác. Không trả số tiền BHXH cho người thiếu quyền.
- Tách tài liệu tham khảo khỏi cấu hình tính thật; lọc nhóm/cơ sở; nhập giờ công quy đổi phút. Sao chép lịch tháng sau thành nháp, buộc nhập lại ngày công và lý do, không tự duyệt hoặc đặt 26 ngày.
- Giữ link tab cũ; mang tháng/cơ sở/nhân sự khi xử lý lỗi. Cả đường chấm công local V2 đang dùng và màn legacy đều có tiếp nhận ngữ cảnh; liên kết quay lại giới hạn ở trang tiền lương.
- Hộp xác nhận khóa hiển thị đúng khấu trừ, nhắc khóa không chuyển khoản. Phạm vi cơ sở không còn nhân sự bị chặn rõ ràng.

## Phạm vi mã

Mã chính: `src/pages/PayrollSettingsPage.tsx`, `src/components/PayrollVersionSettings.tsx`, `src/components/payroll/PayrollBundleReview.tsx`, `src/lib/local-api.ts`, `src/lib/payroll-master-data.ts`, `server/payroll-bundle-approval.ts`, `server/payroll-access.ts`, `server/payroll-rules.ts`, `server/index.ts`.

Liên kết/quyền/nhãn: `ProfileReviewPanel.tsx`, sidebar/mobile, `FactoryAttendancePanel.tsx`, `ProductionAttendancePage.tsx`, `ProductionAttendanceV2Page.tsx`, `AttendanceWorkspaceV2.tsx`. Helper `PayrollDialogContent.tsx` có sẵn được đưa vào manifest để xác minh phụ thuộc.

Migration mới: `server/db/migrations/054_local_payroll_bundle_approvals.sql`, chỉ tạo bảng receipt local và thu hồi quyền PUBLIC. Không sửa migration lịch sử hoặc công thức lương. Giữ các thay đổi có trước về phân quyền, ảnh và kết nối API.

## Kiểm chứng

Tất cả thao tác tạo/duyệt/tính/khóa trong QA sử dụng database dùng một lần, role không đặc quyền và chặn gọi dịch vụ ngoài; không dùng dữ liệu kinh doanh.

| Kiểm tra | Kết quả |
|---|---|
| App/server TypeScript, build server, ESLint phạm vi sửa, whitespace | Đạt |
| Frontend Vite build với `envDir:false` | Đạt; còn cảnh báo kích thước chunk và Browserslist cũ |
| `node scripts/test-payroll-simplification-isolated.mjs` | 15/15 nhóm đạt |
| `node scripts/test-payroll-policies-isolated.mjs` | 12/12 nhóm đạt |
| `node scripts/test-payroll-integrity-isolated.mjs` | 10/10 nhóm đạt |
| `node scripts/test-permissions-isolated.mjs` | 22/22 nhóm đạt |
| Isolated harness `--v2` | Đạt: 3 bản ghi, thu nhập 6224230.769231, khấu trừ 1000000, thanh toán 5224231 |
| Isolated harness `--scope-concurrency` | Đạt |
| Reviewer cuối | 19/19 SHA khớp, không còn finding P1/P2 |

Test mới bao gồm lỗi ở BHXH/audit hoàn tác toàn bộ, sai người/ngày/loại lương, fingerprint cũ, nháp ngoài bộ không bị duyệt, retry và duyệt đồng thời, key dùng chéo người, tranh chấp duyệt lẻ/bộ, từ chối thay đổi BHXH ngầm và từ chối nhân viên/kế toán duyệt bộ.

CUA đã kiểm tra màn hình 375/768/1440px, biểu mẫu ba bước, quản lý lưu nháp/duyệt bộ, bàn phím, kế toán chỉ xem kỳ, link cũ, cơ sở trống và sao chép lịch sang nháp tháng sau. Kỳ giả 02/2025 dùng lịch 24 ngày, lương 2.400.000/tháng và một ngày công cho kết quả 100.000 đồng; khóa thành công. Bằng chứng nằm ngoài repo tại `../outputs/payroll-simplify-mobile.png`; log tại `../outputs/payroll-simplify-*.log`.

## Trạng thái local và giới hạn

- Local đã có migration 052/053 từ lần khởi chạy trước. **054 chưa áp dụng vào database local đang dùng**; API/UI cổng 8787/8090 hiện đã dừng.
- Đã tạo backup `../backups/crm-local-before-payroll-simplification-20261016-150853.dump` (7.978.569 byte). Lệnh bật lại API/UI bị kiểm tra phê duyệt tự động từ chối với “blocked by policy”; không thử cách khác để vượt chặn.
- Khi được phép khởi chạy, dùng `npm run dev:local` từ thư mục repo. Startup kiểm tra checksum và áp dụng migration mới trong transaction. Sau đó kiểm tra `/health`, ledger có 054 và mở `/payroll-settings`.
- Legacy API sửa riêng worker-profiles vẫn có quy tắc quyền cờ BHXH từ trước thay đổi này; đợt này bảo vệ luồng bundle mới, không thay toàn bộ ma trận quyền cũ.
- Quyết toán người nghỉ có khoản cố định, nghỉ hưởng lương và công lễ chưa hỗ trợ vẫn là lỗi chặn cần xử lý nghiệp vụ. Chưa bổ sung công thức mới, file chuyển khoản, gửi phiếu lương hoặc tự ban hành quy chế.
