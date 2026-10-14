# Báo cáo triển khai Sale → cắt → may → chấm công sản lượng

Ngày cập nhật: 07/10/2026  
Phạm vi: bản chạy local SQL trong workspace CRM Joliefam.

## 1. Phạm vi và nguyên tắc

Đợt này hoàn thiện luồng sản xuất trên PostgreSQL local, không xóa, sửa hoặc ghi ngược dữ liệu Supabase public. Các mô-đun CRM còn lại vẫn được giữ trong dự án; báo cáo này chỉ nghiệm thu phần Sale → sản xuất → cắt → may → sản lượng và các điểm nối với chấm công/lương.

Dữ liệu nguồn Sale được giữ làm snapshot để đối chiếu. Các lệnh sản xuất, giao việc, dự toán cắt, báo cáo sản lượng và nghiệp vụ local được xử lý qua Local API và database local.

## 2. Migration local đã áp dụng

- `040_local_production_sales_handoff.sql`: yêu cầu Sale gửi sản xuất, dòng snapshot, tiếp nhận/trả lại, quota số lượng và liên kết ngược về đơn hàng.
- `041_local_cutting_estimates.sql`: dự toán cắt theo phiên bản, dòng vật tư, phương pháp tính, duyệt và liên kết chứng từ kho.
- `042_local_public_production_work.sql`: công việc công khai cho tổ cắt/may, điều kiện nhận, nhận một phần, trả phần chưa làm và mã công may.
- `043_local_cutting_remake_supplements.sql`: dự toán bổ sung cho sửa/làm lại, liên kết sự kiện nguồn và bảo toàn dự toán BASE đã duyệt.
- `044_local_cutting_promotion_guard_cleanup.sql`: dọn guard tạm sau khi promotion 043 đã được ghi nhận, không xóa dữ liệu nghiệp vụ.
- `045_local_snapshot_canonical_backfill.sql`: hoàn thiện projection canonical local cho thanh toán đơn hàng, giao dịch và theo dõi GHN; bổ sung cờ snapshot/local để bảo vệ dữ liệu nhập tại local.
- `046_local_projection_tombstones.sql`: thêm tombstone `LOCAL`/`SOURCE` để thao tác xóa local không bị snapshot đồng bộ tạo lại, đồng thời ẩn bản ghi đã bị xóa ở source.
- `047_local_fabric_transfer_projection.sql`: backfill và duy trì projection `fabric_transfers` từ snapshot Supabase về bảng canonical local.

## 3. Luồng đã triển khai

### Sale và lệnh sản xuất

- Gửi yêu cầu sản xuất từ đơn Sale theo từng dòng, có hạn giao, ưu tiên, ghi chú và khóa gửi lại.
- Quản lý tiếp nhận, trả lại hoặc yêu cầu điều chỉnh; kiểm soát tổng số lượng đã đưa vào sản xuất không vượt số đặt.
- Theo dõi liên kết đơn Sale → yêu cầu sản xuất → lệnh → lô → dòng sản phẩm, kể cả trường hợp chia nhiều đợt.
- Kiểm tra snapshot nguồn khi review để tránh duyệt trên dữ liệu đơn đã thay đổi.

### Dự toán và vật tư cắt

- Tạo, sửa, gửi duyệt và chọn phiên bản dự toán mới nhất.
- Hỗ trợ BOM theo đơn vị, tính thủ công có lý do, trường hợp không cần vật tư và dự toán REMAKE bổ sung.
- Khôi phục bản nháp chứng từ kho, xuất từng phần, chia nhiều kho và tách quyền xuất/duyệt.
- Không ghi đè sổ kho; số đã xuất/trả được liên kết với dự toán và lô.

### Giao việc cắt/may

- Quản lý mở, đóng, hủy công việc công khai; giới hạn theo loại công nhân và công đoạn CUTTER/SEWER.
- Nhân viên xem việc phù hợp, nhận một phần, trả phần chưa làm và không thể nhận vượt phần còn lại.
- Giao việc may yêu cầu mã công và đơn giá hợp lệ theo ngày hiệu lực.
- Có kiểm soát cạnh tranh, idempotency và khóa giao dịch cho các thao tác nhận/trả/báo cáo.

### Báo sản lượng, chấm công và lương

- Nhân viên gửi đạt, sửa/làm lại, lỗi/hỏng theo việc đã nhận; báo cáo chờ duyệt vẫn giữ quota.
- Quản lý duyệt/từ chối/đảo có lý do; dữ liệu nguồn lương chỉ phát sinh một lần cho báo cáo đã duyệt.
- Màn hình nhân viên hiển thị tiền chờ duyệt, đã duyệt và trạng thái thiếu hồ sơ/đơn giá.
- Màn hình chấm công hỗ trợ công theo ngày/giờ và liên kết sản lượng với kỳ lương local.
- Phần hiệu suất lệnh sản xuất dùng cùng aggregate nhân công local với API tính lương; thời lượng cực nhỏ dưới `0,01` phút được quy về `0` để không hiển thị phần trăm sai.

## 4. Kiểm thử và bằng chứng

- Bộ kiểm thử giao việc độc lập: **294 kiểm tra HTTP/concurrency**, bao gồm kiểm tra khởi động lại và bảo toàn dữ liệu.
- Bộ kiểm thử Sale → sản xuất → cắt → may → lương: **511 kiểm tra HTTP/concurrency**, bao gồm kiểm tra khởi động lại và ma trận bảo vệ migration.
- `npm run typecheck:server`: đạt.
- `npx tsc --noEmit -p tsconfig.app.json`: đạt.
- `npm run build`: đạt; bundle vẫn có cảnh báo kích thước chunk lớn.
- `npx eslint src/components/CuttingEstimatePanel.tsx server/index.ts scripts/sync-supabase-to-local.mjs`: đạt, không còn cảnh báo scoped lint; cleanup generation của request đã dùng giá trị generation cục bộ an toàn.
- `npm run audit:local-migration`: đạt với **102 quan hệ, 0 gaps, 0 errors**; `order_payments`, `transactions`, `ghn_tracking` và `fabric_transfers` đều khớp snapshot.
- Kiểm thử tombstone cô lập: xóa bản ghi local/source rồi refresh không tái sinh canonical, replay projection idempotent và các bản ghi local mới vẫn được giữ nguyên.
- Kiểm thử API xóa giao dịch/GHN theo id và theo đơn: tạo đúng tombstone `LOCAL`, sau refresh không còn canonical row.
- Health API hiện tại: `http://127.0.0.1:8787/health` trả `ok=true`, backend `local-postgresql`.
- Giao diện local: `http://127.0.0.1:8090/`.
- Các màn hình chính cần kiểm tra thủ công: `/production-orders`, `/production-attendance`, `/my-attendance`, `/payroll-settings?tab=runs`.

## 5. Cảnh báo còn lại

- Scoped ESLint của các tệp vừa sửa đã sạch, không còn cảnh báo hook exhaustive-deps trong `CuttingEstimatePanel`.
- Build còn cảnh báo một số chunk sau minify lớn hơn 500 kB; đây là cảnh báo tối ưu tải, không phải lỗi chức năng.
- Các tích hợp nhà cung cấp bên ngoài như GHN live sync, phát hành hóa đơn Viettel, OCR tài liệu và AI hosted chưa được coi là parity local; local đang bảo vệ thao tác live hoặc dùng dữ liệu snapshot/fallback.
- Tài khoản Supabase đã snapshot không tự mang theo password hash; cần đặt mật khẩu local riêng trước khi chuyển người dùng sang đăng nhập local. Đây là blocker external/Auth còn lại, không phải lỗi migration canonical.

## 6. Giới hạn nghiệm thu

Báo cáo này xác nhận phạm vi luồng sản xuất local nêu trên và kết quả kiểm thử tương ứng. Chưa tuyên bố toàn bộ CRM đã nghiệm thu end-to-end; các mô-đun khách hàng, báo giá, hợp đồng, tài chính, GHN, hóa đơn điện tử, kho vải và các tích hợp ngoài phạm vi cần được kiểm tra theo bộ tiêu chí riêng trước khi ngắt Supabase public.

