# Rà soát tính toàn vẹn bảng lương — 15/10/2026

Phạm vi: chấm công, sản lượng, tăng ca, hồ sơ nguồn lương, phụ cấp/khấu trừ và thao tác tính/khóa kỳ. Giữ nguyên công thức lương, hệ số và cấu hình nghiệp vụ đã duyệt. Mọi tái hiện và ghi dữ liệu kiểm thử dùng cơ sở dữ liệu Docker dùng một lần; không dùng dữ liệu lương thật.

## Kết quả tái hiện trước khi sửa

1. Preview có tổng lương 0 vẫn khóa thành công sau khi phát sinh nguồn đã duyệt trị giá 100.000 đồng. Khi khóa, hệ thống không đối soát lại nguồn hiện tại.
2. Điều chỉnh nháp của kỳ đã đóng vẫn gửi/duyệt được qua API. Ghi dữ liệu và nhật ký kiểm toán chưa nằm trong cùng giao dịch.
3. Tăng ca ngày 05/05 thiếu đơn giá tại ngày đó nhưng đơn giá bắt đầu 15/05 khiến preflight báo đạt; tính lương có thể bỏ qua tăng ca này.
4. SQL cho phép chuyển nguồn ngày 15/07 thuộc kỳ đã khóa sang ngày 15/08 đang mở, do trigger chỉ kiểm tra ngày mới.
5. Kỳ tháng 09 và kỳ con 10–20/09 có thể cùng khóa, trả trùng một nguồn 100.000 đồng.
6. Nguồn ngày 05/06 và hồ sơ payroll bắt đầu 15/06 vẫn qua preflight; cờ cuối kỳ có thể làm bỏ nguồn đầu kỳ.

## Hành vi sau bản sửa

- Preview mới ghi dấu SHA-256 nguồn có phiên bản trong `config_snapshot`. Khóa kỳ giữ khóa nguồn độc quyền, đối chiếu dấu nguồn và chạy lại preflight. Nguồn thay đổi hoặc còn lỗi chặn trả lỗi 409, yêu cầu tính lại; không ghi khóa kỳ hay nhật ký thành công.
- Preview cũ thiếu dấu nguồn phải tính lại. Run đã khóa giữ nguyên hành vi xem lại/idempotent; không tính lại lịch sử.
- Nguồn và cấu hình liên quan có trigger dùng khóa giao dịch chung để đồng bộ với bước chụp/khóa nguồn. Dấu nguồn dùng JSON PostgreSQL dạng chuỗi, giữ nguyên độ chính xác số tiền.
- Phụ cấp/khấu trừ dùng giao dịch thống nhất: khóa nguồn, khóa kỳ, khóa điều chỉnh; chặn kỳ đóng và kiểm tra trạng thái chuyển tiếp. Người tạo và nhật ký lấy tài khoản thực. Nếu ghi nhật ký lỗi, dữ liệu điều chỉnh được rollback.
- Tăng ca phải có đúng một mức giá hợp lệ tại ngày phát sinh trong nhóm ưu tiên hiện hành: giá giờ, sau đó giá ngày của lương tháng được quy đổi. Thiếu/trùng mức giá là lỗi chặn; không âm thầm bỏ tăng ca.
- Hồ sơ thay đổi cờ nguồn trong kỳ hoặc không bao phủ ngày phát sinh được báo lỗi chặn. Không tự đặt cách chia tháng hoặc thay đổi thứ tự ưu tiên công thức.
- Trigger kiểm tra cả ngày cũ và ngày mới khi sửa nguồn. Kỳ giao nhau với kỳ đã đóng không được tính/khóa thêm để trả trùng nguồn.

Dấu nguồn hiện đối soát thận trọng cả danh mục sản phẩm, nhóm chính sách, chính sách và bảng giá công may đã duyệt. Thay đổi danh mục/cấu hình ngoài phạm vi nhân sự cũng có thể yêu cầu tính lại preview. Đây là giới hạn hiện tại, không phải thay đổi số tiền hay công thức.

## Tệp và triển khai

- `server/index.ts`: giao dịch điều chỉnh, kiểm tra đầu vào và đối soát khi khóa.
- `server/payroll-snapshot.ts`: dấu nguồn ổn định và tra đơn giá tăng ca theo ngày.
- `server/db/migrations/052_local_payroll_snapshot_integrity.sql`: migration bổ sung; không sửa migration lịch sử, không sửa bản lương đã khóa.
- `scripts/test-payroll-integrity-isolated.mjs`: bộ kiểm thử do tester phụ trách.

Baseline trước sửa được lưu tại thư mục ngoài repository `outputs/payroll-fix-baseline`. Diff phần server của tác vụ được lưu riêng để không lẫn các thay đổi quyền và ảnh/API đang tạm dừng.

**Migration 052 chưa được áp dụng vào cơ sở dữ liệu dùng chung hoặc VPS. Chưa commit, push hay triển khai bản sửa.** Khi người vận hành cập nhật máy chủ, cần sao lưu cơ sở dữ liệu trước và dùng đúng quy trình migration local đang có; không chạy migration Supabase production.

## Kiểm chứng hiện tại

Các lệnh kiểm tra không nạp tệp môi trường:

```powershell
npm run typecheck:server
npx tsc --noEmit -p tsconfig.app.json
npx eslint server/payroll-snapshot.ts
npm run build:server
node scripts/test-payroll-integrity-isolated.mjs --baseline
node scripts/test-payroll-integrity-isolated.mjs
node scripts/test-payroll-integrity-isolated.mjs --scope-concurrency
node scripts/test-payroll-integrity-isolated.mjs --v2
node scripts/test-permissions-isolated.mjs
```

Lệnh `--baseline` được chạy trước khi thay bản biên dịch để ghi nhận sáu lỗi; không chạy lại trên bản đã sửa để so sánh lịch sử. Các bộ API tạo và dọn cơ sở dữ liệu/tài khoản riêng, chặn gọi dịch vụ hosted và không đọc `.env`.

Đã đạt: TypeScript server/frontend, ESLint module mới, build server; 10/10 nhóm payroll và 22 nhóm quyền trong môi trường cô lập. Đối chiếu tài chính gồm nguồn 100.000 đồng, tổng thu nhập 125.000, khấu trừ 10.000, thực nhận 115.000 đồng; trường hợp khác 75.000 đồng. Các bộ payroll V2 và phạm vi/đồng thời đã đạt; sau sửa tối thiểu cuối cùng ở trigger, bộ 10 nhóm chạy lại đạt, gồm tình huống API PATCH đồng thời với SQL trực tiếp không còn deadlock `40P01`. Build frontend kiểm tra riêng đã đạt, còn cảnh báo Browserslist/chunk kích thước. Kiểm tra giao diện trực tiếp chưa hoàn tất do công cụ trình duyệt hết thời gian chờ.

Review độc lập cuối cùng không còn phát hiện cần sửa. Trigger điều chỉnh đọc trạng thái kỳ dưới khóa nguồn chung, không lấy khóa dòng kỳ sau khóa dòng điều chỉnh; API tiếp tục giữ thứ tự nguồn → kỳ → điều chỉnh để tránh deadlock.

**Trạng thái: bản sửa và kiểm thử cục bộ hoàn tất; chưa triển khai và chưa áp dụng migration vào cơ sở dữ liệu dùng chung/VPS. Giao diện chưa được xác minh trực tiếp.**
