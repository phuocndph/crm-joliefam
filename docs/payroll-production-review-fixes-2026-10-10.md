# Rà soát chấm công, sản lượng và kỳ lương local — 2026-10-10

## Phạm vi đã nghiệm thu

Đợt này chỉ hoàn thiện các luồng local cho chấm công xưởng, sản lượng và kỳ
lương. Không có thay đổi hay ghi dữ liệu vào Supabase/bản public. Migration
`049_local_payroll_worker_source_guard.sql` đã được áp dụng cho cơ sở dữ liệu
local `crm_local` (health check xác nhận đúng cơ sở dữ liệu local).

## Các thay đổi chính

- Payroll preview/run nhận phạm vi `worker_ids`, chuẩn hóa UUID, lưu cả danh
  sách được yêu cầu và danh sách thực sự đủ điều kiện vào snapshot. Dữ liệu
  chấm công, sản lượng, tăng ca, điều chỉnh được đọc theo danh sách đã giải
  quyết, không lấy lẫn nguồn của nhân sự ngoài phạm vi.
- Một nhân sự được yêu cầu nhưng vừa ngưng payroll/ngoài thời hạn làm việc vẫn
  là request hợp lệ nếu tồn tại; preflight tự loại nhân sự đó khi xác định
  người đủ điều kiện. UUID sai hoặc không tồn tại vẫn bị từ chối.
- Idempotency giữ nguyên snapshot cũ, kể cả khi nhân sự đã ngưng sau lần tạo.
  Cùng idempotency key nhưng đổi phạm vi vẫn bị từ chối.
- Khóa một payroll run vẫn đóng toàn bộ kỳ lương. Trước khi khóa, hệ thống đối
  chiếu tất cả nhân sự payroll thực sự đang đủ điều kiện; run bỏ sót người thật
  nhận HTTP 409. Chỉ fixture có mã/tên bắt đầu `HARDEN` hoặc `PAYTEST` mới có
  thể bị bỏ qua khi đối chiếu này.
- Migration 049 thêm trigger mức statement cho mọi ghi `local_workers`, dùng
  advisory lock chung với nguồn payroll. Các transaction duyệt hồ sơ, liên kết
  worker, import workbook và cập nhật profile bundle cũng lấy lock này trước
  khi khóa dòng worker. Không dùng table lock `local_workers`.
- Trang Kỳ lương chỉ cho kiểm tra/tạo preview khi roster đã tải xong. Kết quả
  preflight bất đồng bộ được gắn với chữ ký kỳ/phạm vi đã gửi, nên không thể
  hiển thị nhầm sau khi danh sách nhân sự đổi.
- Hoàn thành lệnh sản xuất cho phép ghi `số lượng đạt = 0` nếu có phế phẩm,
  nhưng chặn trường hợp cả đạt và phế phẩm đều bằng 0. UI có hai ô riêng cho
  đạt và phế phẩm.
- Thời gian chuẩn bằng 0 không chặn hoàn thành; UI không hiển thị hiệu suất
  giả `0%` và giải thích đây có thể là công đoạn tự động hoặc cần rà soát định
  mức. Lệnh lịch sử đã hoàn thành nhưng tổng đầu ra bằng 0 được cảnh báo để
  đối soát, không tự sửa số lượng.

## Tệp liên quan

- `server/index.ts`
- `server/db/migrations/049_local_payroll_worker_source_guard.sql`
- `src/pages/PayrollSettingsPage.tsx`
- `src/pages/ProductionOrdersPage.tsx`
- `src/lib/local-api.ts`
- `src/pages/ProfileReviewPage.tsx`
- `scripts/test-local-payroll-v2.ps1`
- `scripts/test-local-production-dispatch.mjs`
- `scripts/test-local-payroll-scope-concurrency.ps1` và harness đi kèm

## Kiểm chứng

Đã đạt:

- `npm run typecheck:server`
- `npx tsc --noEmit -p tsconfig.app.json`
- ESLint có phạm vi cho server và các trang đã sửa
- Build ứng dụng; chỉ còn cảnh báo Browserslist/chunk, không có lỗi build
- Isolated `test-local-payroll-v2.ps1`
- Isolated production dispatch: 310 kiểm tra HTTP/đồng thời, gồm lưu giữ sau
  restart
- Isolated payroll scope/concurrency: UUID sai/không tồn tại, nhân sự ngưng,
  idempotency, scoped run khóa toàn kỳ, trigger migration 049 và thứ tự lock

## Trạng thái dữ liệu hiện tại

Trên UI local, có 6 nhân sự đang hiển thị và preflight phát hiện 15 lỗi chặn
trên 5 hồ sơ cần cấu hình thật: `DAY-001`, `PIECE-001`, `HOUR-001`, `NV-ONL`
và `DEMO-20260914`. `Demo Local` hiện không có lỗi chặn trong kết quả này.
Không tự tạo hay suy đoán cấu hình lương còn thiếu cho các hồ sơ trên.

## Giới hạn còn lại

- Snapshot payroll cũ không có metadata scope vẫn được đọc/khóa tương thích.
- Khóa payroll vẫn là khóa toàn kỳ, không phải khóa theo từng nhân sự.
- Lệnh hoàn thành lịch sử không có đầu ra cần người vận hành đối soát và quyết
  định xử lý; hệ thống không tự thay đổi số lượng lịch sử.
- Việc ban hành/chỉnh chính sách lương và hoàn thiện 15 lỗi dữ liệu là thao tác
  nghiệp vụ ngoài phạm vi hardening này.
- Báo cáo này không khẳng định toàn bộ dự án hoặc bản public đã hoàn tất.
