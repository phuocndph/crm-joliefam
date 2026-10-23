# Chuẩn hóa giao diện Kho, Chấm công và Duyệt hồ sơ — 19/10/2026

## Mục tiêu và phạm vi

Hoàn thiện giao diện ba tuyến `/inventory-management`, `/production-attendance`,
`/profile-review` theo yêu cầu: bố cục gọn, nhất quán, thao tác theo ngữ cảnh,
quản lý dễ quan sát và sử dụng được trên điện thoại.

Phạm vi là frontend và kiểm thử. Không thay schema, quy chế lương, quyền ở máy chủ,
API hoặc triển khai lên VPS. Dữ liệu nghiệp vụ local không dùng để thử ghi sổ,
duyệt hồ sơ hoặc chốt công; các thao tác kiểm thử dùng cơ sở dữ liệu tạm riêng.

## Thiết kế và kế hoạch triển khai

### 1. Khung giao diện chung

- `WorkspaceCommandBar`: tiêu đề, mô tả ngắn, tác vụ chính và vùng lọc cùng một khối.
- `StatusFilterStrip`: bộ lọc nhanh có trạng thái chọn, số lượng và nhãn rõ ràng.
- Thứ tự nhất quán: tiêu đề/tác vụ → phạm vi/bộ lọc → chế độ xem → dữ liệu → xử lý chi tiết.
- Bảng rộng cuộn trong vùng dữ liệu; không làm tràn chiều ngang của trang.
- Phân biệt đang tải, tải lỗi, không có dữ liệu, thiếu quyền và dữ liệu đã sẵn sàng.

### 2. Kho & vật tư

- Tạo nhanh nhập kho, xuất sản xuất và điều chỉnh theo đúng quyền.
- Bấm tóm tắt để tới đúng danh sách: vật tư hoạt động, vị trí có tồn, phiếu nháp.
- Tồn kho có tìm kiếm, lọc kho, nhập/xuất theo dòng và mở thẻ kho của vật tư.
- Tạo từ dòng điền đúng kho, vật tư, đơn vị và vị trí; vẫn yêu cầu người dùng nhập
  số lượng, thông tin nghiệp vụ và lệnh sản xuất khi cần.
- Phiếu kho có bộ lọc trạng thái nhanh và nút có chữ “Xác nhận ghi sổ”, “Hủy nháp”.
- Chỉ hiển thị kết quả sau khi truy vấn thành công; lỗi và tải lại hiển thị riêng.
  Bản local phải thông báo đúng khả năng API, không khẳng định đã đối chiếu độc lập sổ kho.
- Không biến lỗi tải thành tồn bằng 0; nêu giới hạn số bản ghi đang hiển thị.

### 3. Chấm công xưởng

- Tiêu đề/tác vụ dùng khung chung; giữ liên kết từ đối soát lương và phạm vi nhân sự/cơ sở.
- Gom vùng ngày, nhóm, tìm kiếm và trạng thái; tránh lặp công cụ và bộ lọc.
- Một hàng đợi xử lý ngày, sau đó mở chi tiết để kiểm tra nguồn và thao tác.
- Đủ năm chế độ trên mọi kích thước: Cần xử lý, Theo ngày, Theo tháng, Tăng ca, Lịch sử.
- Giữ nguyên xác nhận thay bắt buộc lý do, chốt ngày, revision, fingerprint,
  idempotency, quyền duyệt và khóa kỳ lương.

### 4. Duyệt hồ sơ

- Desktop: danh sách bên trái, hồ sơ chi tiết bên phải; mobile: danh sách → chi tiết → quay lại.
- Bộ lọc Chờ xác nhận / Đã yêu cầu bổ sung / Đã duyệt và tìm theo tên, email, SĐT, CCCD.
- Bốn nhóm thông tin: định danh, ngân hàng/thuế/BHXH, liên hệ/địa chỉ, khẩn cấp/ghi chú.
- Chỉ hồ sơ chờ xác nhận được xử lý. Hồ sơ đã phản hồi/đã duyệt là chế độ xem lịch sử.
- Đổi nhân viên/phiên bản phải bỏ ghi chú và liên kết dự thảo của hồ sơ trước;
  tên trùng không được tự chọn công nhân đầu tiên.
- Khóa chuyển ngữ cảnh trong khi lưu; kiểm tra công nhân đủ điều kiện trước duyệt.
- Giữ kiểm tra `expected_revision`, xử lý 409 và điều kiện quyền cho liên kết thiết lập lương.

## Bất biến và đường xác minh

| Bất biến | Bằng chứng cần kiểm tra |
| --- | --- |
| Sổ kho là nguồn số dư | Không thêm đường ghi trực tiếp vào balance/movement; vẫn gọi create/confirm/void hiện có |
| Phiếu đã ghi sổ không hủy trực tiếp | Chỉ phiếu DRAFT có tác vụ xác nhận/hủy; kiểm thử nháp → xác nhận và nháp → hủy |
| Quyền độc lập và ẩn giá | Kiểm tra JSX theo canView/canCreate/canConfirm/canAdjustment/canOpening/canViewCost/canAudit và tài khoản hạn chế |
| Không lẫn hồ sơ | Kiểm thử chuyển lựa chọn/trạng thái/tìm kiếm, làm mới khác phiên bản và xung đột 409 |
| Không mất chức năng mobile | Kiểm thử ba trang ở 375, 768, 1440 px; mở mọi chế độ chấm công và chi tiết hồ sơ |
| Không tác động dữ liệu thật | Fixture tự tạo DB/API/frontend riêng, chặn mạng ngoài và tự dọn tài nguyên |

## Kết quả kiểm tra ban đầu

- `npx tsc --noEmit -p tsconfig.app.json`: PASS trước khi hoàn thiện đợt này.
- `npm run build:server`: PASS, phục vụ môi trường API kiểm thử cô lập.
- `node scripts/test-readiness-helpers.mjs`: PASS 4/4.
- `npm run lint`: baseline FAIL 789 lỗi, 48 cảnh báo trên toàn repository.
  Log: `.local-staging-runtime/lint-workspace-20261019.log`. Không có mục lỗi cho
  sáu tệp giao diện trong phạm vi trước đợt hoàn thiện. Kết quả lint toàn bộ không
  được mô tả là PASS; sẽ kiểm tra riêng các tệp đã đổi.

## Báo cáo hoàn thiện

Đã triển khai khung chung và các thay đổi trong mục 1–4. Kiểm thử thao tác dùng
database/API/frontend tạm, bao gồm ghi sổ kho và duyệt hồ sơ thực trên dữ liệu giả.

Các lỗi được tìm và sửa trong rà soát độc lập:

- Không giữ mã công nhân/ghi chú của nhân viên trước khi chuyển hồ sơ hoặc phiên bản.
- Không cho duyệt lại hồ sơ ở trạng thái đã xử lý; xung đột 409 đóng chi tiết cũ.
- Không chặn nhật ký chỉ chứa metadata bằng quyền xem giá vốn.
- Hiển thị vị trí theo từng dòng phiếu, kể cả sau khi thêm hoặc xóa dòng.
- Nút hủy nháp phù hợp với quyền hiện tại của từng backend: local yêu cầu quyền
  tạo phiếu và xác nhận; hosted yêu cầu quyền tạo phiếu.
- Trạng thái tải/lỗi của số dư không được hiển thị thành tồn tổng bằng 0.
- API local chưa đối soát ledger nên giao diện chỉ báo “Đã tải số dư kho”.
- Thanh phạm vi chấm công chỉ xuất hiện khi thực sự lọc nhân sự/cơ sở; tham số
  tháng do URL tự đồng bộ không tạo nút bỏ lọc vô nghĩa.
- Tăng ca và lịch sử theo tháng áp dụng cùng phạm vi nhân sự được truyền từ trang;
  không hiện nhân sự kiểm thử đang ẩn hoặc nhân sự ngoài bộ lọc cơ sở. Tổng phút,
  bảng và trạng thái rỗng của tăng ca dùng chung bộ lọc.
- Trên mobile, quay lại danh sách hồ sơ trả tiêu điểm sau khi React đã hiển thị
  danh sách. Khoảng cuộn chừa chỗ cho thanh đầu trang, để nút quay lại không bị che.
  Bộ kiểm thử xác minh vị trí nút, điểm bấm và tiêu điểm ở 375/768 px.

Rà soát độc lập sau sửa: không còn finding có thể hành động trong phạm vi đã
kiểm tra. Rà soát tĩnh không được coi là thay thế cho kiểm thử qua trình duyệt.

Tệp thay đổi trong kế hoạch:

- `src/components/workspace/WorkspaceShell.tsx`
- `src/pages/InventoryManagementPage.tsx`
- `src/pages/ProductionAttendanceV2Page.tsx`
- `src/components/AttendanceWorkspaceV2.tsx`
- `src/pages/ProfileReviewPage.tsx`
- `src/components/ProfileReviewPanel.tsx`
- `scripts/test-workspace-redesign-browser.mjs`
- `scripts/test-profile-workspace-browser.mjs`
- Tài liệu này.

Kết quả đã xác minh:

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| TypeScript app | PASS | `npx tsc --noEmit -p tsconfig.app.json` |
| ESLint sáu tệp giao diện | PASS, 0 lỗi/cảnh báo | Chạy trực tiếp ESLint trên sáu tệp liệt kê trên |
| Frontend build | PASS | `.local-staging-runtime/build-workspace-20261019.log`; cảnh báo chunk lớn vẫn có |
| Server build phục vụ fixture | PASS | `npm run build:server` |
| Attendance/payroll browser regression | PASS 16/16 | `.local-staging-runtime/attendance-browser-workspace-20261019.log` |
| Readiness helpers | PASS 4/4 | `node scripts/test-readiness-helpers.mjs` |
| Kho, phạm vi chấm công và responsive ba trang | PASS 27/27 | `.local-staging-runtime/workspace-redesign-20261019/results.json`; `scripts/test-workspace-redesign-browser.mjs` |
| Duyệt hồ sơ browser | PASS 15/15 | `.local-staging-runtime/profile-workspace-20261019/report.json`; `scripts/test-profile-workspace-browser.mjs` |
| Kiểm tra bản local đang chạy | PASS ba tuyến | Phiên IAB `127.0.0.1:8090`: kho có lọc/tác vụ mới, năm chế độ chấm công, ba trạng thái hồ sơ; không có lỗi console mới sau khi nạp bản cuối |
| Diff và cú pháp script | PASS | `git diff --check` trong phạm vi; `node --check` hai script mới |
| Lint toàn repository | FAIL baseline | 789 lỗi, 48 cảnh báo có từ trước; không mô tả toàn repository là sạch lint |

Không có thay đổi database/API, push GitHub hoặc triển khai VPS trong đợt này.

Kiểm thử duyệt hồ sơ xác minh duyệt/liên kết và lưu lịch sử thật, yêu cầu bổ sung,
xung đột revision 409 thật, chặn khi danh sách công nhân đang tải/lỗi và tải lại,
không lẫn ghi chú/liên kết giữa hồ sơ/phiên bản, không tự chọn khi trùng tên,
ba trạng thái, giao diện danh sách/chi tiết/quay lại và tiêu điểm trên ba kích thước.
Không có lỗi JavaScript hoặc lỗi console ngoài các HTTP 503/409 được cố ý tạo
trong kịch bản kiểm thử. Fixture xác nhận đã dọn API/frontend/database/role tạm.

Kiểm thử Kho xác minh chọn tóm tắt xóa đúng bộ lọc cũ, nhập/xuất từ số dư điền
đúng kho/vật tư/đơn vị/vị trí, lỗi tạo rồi thử lại giữ cùng idempotency key và
chỉ tạo một phiếu nháp. Xác nhận tạo đúng một movement với số lượng numeric;
hủy nháp bắt buộc lý do và không ghi movement. Tài khoản chỉ lập phiếu không
thấy nút xác nhận/hủy local; quyền audit xem được metadata khi không có quyền
xem giá. Kiểm thử lỗi/tải lại số dư và đối soát không biến lỗi thành tồn bằng 0.

Kiểm thử Chấm công xác minh năm chế độ trên 375/768/1440 px, liên kết theo một
nhân sự giữ phạm vi cho cả tăng ca/lịch sử, tìm kiếm không khớp đưa tổng về 0,
nhân sự kiểm thử chỉ xuất hiện khi chủ động bật. Liên kết theo nhân sự mở chi
tiết ngày như thiết kế; đóng chi tiết vẫn giữ đúng chế độ lịch sử.

Tổng cộng 58/58 ca trình duyệt và 4/4 helper đạt. Không còn mục frontend chưa
hoàn thành trong phạm vi kế hoạch này. Các giới hạn backend bên dưới vẫn còn.

Ảnh kiểm chứng cuối (dữ liệu giả QA):

- Kho desktop/mobile: `.local-staging-runtime/workspace-redesign-20261019/inventory-management-{375,768,1440}.png`.
- Chấm công: `.local-staging-runtime/workspace-redesign-20261019/attendance-{375,768,1440}.png`.
- Hồ sơ danh sách/chi tiết: `.local-staging-runtime/profile-workspace-20261019/screenshots/profile-{list,detail}-{375,768,1440}.png`.
- Ghi chú kiểm thử Kho/Chấm công: `.local-staging-runtime/workspace-redesign-20261019/verification-notes.md`.
- Snapshot SHA256 sáu tệp sau sửa cuối: `.local-staging-runtime/workspace-final-files-20261019.json`.

API local cổng 8787 và frontend 8090 trả HTTP 200 sau kiểm thử; dịch vụ local và
PostgreSQL dùng chung được giữ nguyên. Các fixture riêng đã tự dọn tài nguyên.

## Giới hạn sẵn có của backend

- `server/index.ts`, endpoint `/api/inventory/reconciliation`, hiện lấy số dư và
  trả cùng giá trị ở cả cột sổ kho và cột số dư. Nó chưa thực hiện phép đối chiếu
  độc lập với ledger. Frontend local cần ghi rõ giới hạn và chỉ báo đã tải số dư;
  không được coi phản hồi này là bằng chứng sổ kho đã khớp. Nâng cấp bộ máy đối
  soát là công việc backend riêng, không nằm trong kế hoạch frontend này.
- API hồ sơ đã duyệt không có mã công nhân lịch sử tại thời điểm duyệt. Chi tiết
  chỉ hiển thị liên kết công nhân hiện tại lấy từ danh sách nhân sự.
- Các danh sách phiếu/giao dịch vẫn theo giới hạn API 500/1.000 bản ghi; giao diện
  nêu rõ giới hạn. Phân trang hoặc truy vấn lịch sử toàn bộ cần thay đổi API riêng.
