# Cải thiện giao diện chấm công và tiền lương — 17/10/2026

Triển khai theo yêu cầu sửa frontend đã được duyệt. Đối chiếu mã thực tế trước sửa: bản local `/production-attendance` dùng `ProductionAttendanceV2Page` và `AttendanceWorkspaceV2`; hàng đợi, chi tiết ngày và ba nhóm tiền lương đã tồn tại. Giữ nền nghiệp vụ mới này và bổ sung các điểm thao tác còn thiếu.

## Giao diện đã thay đổi

- **Chấm công của tôi:** ba mục Hôm nay / Công & thu nhập / Hồ sơ. Công tháng và thu nhập sản lượng có điều hướng riêng. Các biểu mẫu vẫn được giữ khi chuyển mục; ghi chú chưa gửi không bị xóa. Hồ sơ có đường mở trang chỉnh sửa hiện hữu và thông tin cách chấm công theo ngày đang chọn.
- **Ghi nhận ngày:** biểu mẫu công đặt trước phần xem lại toàn bộ nguồn. Xác nhận ngày vẫn nằm sau tất cả nguồn công/sản lượng/tăng ca, giữ điều kiện revision và duyệt hiện hữu. Hai nút chọn nửa/đủ công chỉ thay giá trị, chỉ xuất hiện cho DAY ngoài chế độ MONTHLY; vẫn phải gửi biểu mẫu. Tăng ca nằm trong vùng mở rộng có nhãn rõ.
- **Quản lý xưởng:** nút lọc nhanh Tất cả / Chờ duyệt / Bị từ chối / Chưa ghi nhận / Đã chốt ngày, dùng bộ lọc hiện có. Từ hàng đợi, chọn Chưa ghi nhận hoặc Đã chốt ngày sẽ chuyển sang Theo ngày. Không suy diễn ngày trống thành vắng mặt. Nút lọc tối thiểu 48px.
- **Kỳ lương:** desktop giữ bảng đối soát; mobile dùng thẻ từng người. Nút Phiếu lương mở khung bên riêng có tổng hợp lương, sản lượng/tăng ca, khoản thu khác, khấu trừ, thanh toán, nguồn tính và ngoại lệ. Chi tiết kỹ thuật thu gọn. Nút đóng lớn, có Escape và trả focus về nút mở.
- **Độ chính xác:** tất cả số phiếu lương lấy từ snapshot máy chủ và định dạng chuỗi decimal hiện hữu; không cộng lại bằng số thực frontend. Phiếu đóng khi đổi kỳ/phạm vi/bản tính/quyền hoặc truy vấn đang tải/lỗi. Xuất CSV toàn bản tính giữ nguyên phạm vi.

Không sửa API, schema/migration, quyền, công thức, điều kiện duyệt/chốt. Ba nhóm tiền lương hiện có và các deep-link `?tab=...` được giữ.

## Tệp sản phẩm

- `src/pages/MyAttendancePage.tsx`
- `src/components/AttendanceWorkspaceV2.tsx`
- `src/components/payroll/PayrollMonthWorkbench.tsx`
- `src/components/payroll/PayrollPayslipSheet.tsx` mới

Ba tệp hiện hữu được sao lưu trước lượt này tại `.local-staging-runtime/attendance-frontend-before-20261017/`. Review so sánh đúng các bản này, không coi toàn bộ worktree đang sửa là thay đổi của lượt này. Các sửa đổi sẵn có khác được giữ nguyên.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt |
| ESLint bốn tệp frontend và hai script QA | Đạt, không lỗi/cảnh báo |
| `node scripts/test-attendance-workspace-read-model.mjs` | Đạt 8 nhóm |
| `node scripts/test-attendance-corrective-read-model.mjs` | Đạt 4 nhóm |
| `node scripts/test-attendance-frontend-browser.mjs` | Đạt 16/16 kiểm tra |
| Frontend production build qua fixture, `configFile:false`, `envDir:false` | Đạt |
| Review độc lập theo bản sao trước sửa | Không phát hiện lỗi chặn trong bốn tệp |

Browser QA dùng Chrome headless, tài khoản giả đăng nhập qua biểu mẫu thật, API/database/role riêng và chặn yêu cầu ngoài origin QA. Có kiểm tra 375/768/1440px; giữ ghi chú chưa gửi, xem công/thu nhập, nút bấm lớn, không tràn trang, bộ lọc và chi tiết ngày; số tiền chính xác đến 6 chữ số lẻ, Tab/Shift+Tab trong phiếu, Escape/trả focus và đổi kỳ đóng phiếu. Bản tính lương thử tháng 01/2019 chứa số giả, không phải lương vận hành.

Lượt browser đầu có một assertion đóng phiếu đọc trạng thái ngay trong hiệu ứng đóng. Đã sửa bộ kiểm tra chờ khung ẩn và chụp ảnh sau hiệu ứng; không cần sửa mã sản phẩm. Lượt cuối đạt 16/16.

Script fixture được bổ sung snapshot lương giả; script browser mới lưu ảnh tại `.local-staging-runtime/attendance-frontend-20261017/screenshots/`. Sau mỗi lượt, database/role/API/frontend QA được dọn bằng cơ chế của fixture; ảnh được giữ để đối chiếu. Không ghi dữ liệu thử vào `crm_local`, không thay tài khoản vận hành hoặc truy cập Supabase từ xa, không commit/push/deploy.

## Giới hạn còn lại

- Tab Hồ sơ cung cấp đường chỉnh sửa và thông tin cấu hình. Chưa có trình đọc tài liệu quy chế đã ban hành cho nhân viên; giao diện nêu liên hệ quản lý nhân sự.
- Thu nhập cá nhân hiện là phần dữ liệu đã được API cung cấp, chưa phải tổng phiếu lương đầy đủ gồm mọi khoản lương tháng/tăng ca. Chú thích giới hạn được giữ rõ.
- Fixture browser tập trung nhân viên lương tháng và quản trị viên. Nửa/đủ công được review theo điều kiện mã nhưng chưa có nghiệm thu browser bằng tài khoản DAY riêng; chưa nghiệm thu mọi vai trò, thiết bị, trình duyệt hoặc quy chế doanh nghiệp thực tế.
- Bản Supabase dùng màn quản lý cũ, không được chuyển route hay thay backend trong lượt chỉnh frontend này. Màn tự chấm công và bàn kỳ lương local giữ điều kiện khả dụng như trước.

Đây là nghiệm thu phạm vi giao diện đã nêu, không phải chứng nhận toàn dự án hết lỗi.
