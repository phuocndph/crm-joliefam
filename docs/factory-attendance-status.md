# TRẠNG THÁI CHẤM CÔNG XƯỞNG ĐỘC LẬP

Cập nhật: 2026-09-24

## Phạm vi đã hoàn thiện ở local

- Bảng chấm công độc lập với lệnh sản xuất.
- Ba hình thức theo hồ sơ nhân sự: theo ngày, theo giờ và theo sản lượng.
- Bảng ngày, bảng tháng và lịch sử chi tiết.
- Chấm theo giờ có giờ đến, giờ về, phút nghỉ và tự tính giờ thực tế.
- Mức công hiệu lực theo ngày được snapshot vào bản ghi.
- Idempotency key chống ghi trùng khi retry.
- Bản ghi bất biến; điều chỉnh dùng reversal append-only và có audit.
- Ẩn tiền công theo quyền; không trả rate/cost cho người không có quyền.
- Giao diện mobile có thẻ gọn; desktop có bảng tháng theo ngày/ca.
- Khi một người có nhiều lượt trong ngày, màn ngày hiển thị tổng theo từng đơn vị và số lượt, không còn lấy riêng lượt cuối.
- Workflow cục bộ đã có: `SUBMITTED -> APPROVED/REJECTED -> LOCKED`, chốt ngày hai cấp và tăng ca độc lập.
- Chuyển trạng thái dùng event append-only, idempotency và khóa giao dịch để tránh duyệt đồng thời.
- UI có bộ lọc workflow, tổng phút tăng ca và khóa thao tác ghi/chốt khi endpoint chưa sẵn sàng.
- Tổng payroll/chi phí trên màn hình chỉ tính bản ghi `APPROVED`/`LOCKED`; `SUBMITTED` được tách riêng là chờ duyệt và `REJECTED` không được cộng.
- Chốt ngày và ghi chấm công/tăng ca dùng cùng advisory lock theo nhân sự/ngày, tránh race condition ghi sau khi vừa chốt.
- Retry idempotency của chấm công ngày kiểm tra cả `standard_hours_per_day`, không cho cùng mã yêu cầu đổi công thức tiền.
- Sau `LEADER_CONFIRMED`, không được đảo bản ghi hoặc sửa workflow; phải `Mở lại` trước, ngoại lệ duy nhất là chuyển bản ghi đã duyệt sang `LOCKED`.
- Trạng thái ngày độc lập đã có: `PRESENT`, `ABSENT`, `PAID_LEAVE`, `UNPAID_LEAVE`, `HOLIDAY`, `OFF`.
- Trạng thái ngày và cờ đủ điều kiện tiền ăn được lưu dưới dạng event append-only; ngày không có bản ghi dương không còn bị mặc định là "chưa nhập".
- Database guard chặn ghi attendance sau khi ngày đã đánh dấu vắng/nghỉ/off và chặn hai ca theo giờ chồng nhau; ngày lễ vẫn có thể ghi công lễ, hai ca liền kề vẫn hợp lệ.
- Bản ghi `REJECTED` vẫn giữ trong lịch sử nhưng không chiếm giới hạn ngày/giờ, không giữ khoảng ca và không được coi là công thực tế khi kiểm tra chốt ngày; bản ghi sửa được ghi bằng mã yêu cầu mới.
- Tăng ca bị chặn trên ngày `ABSENT`, `PAID_LEAVE`, `UNPAID_LEAVE`, `OFF`; `HOLIDAY` vẫn cho phép ghi tăng ca.
- Toàn bộ RPC đọc/ghi chấm công, tăng ca, workflow và chốt ngày chỉ cho role `authenticated`; role `anon` không còn quyền gọi trực tiếp.
- Scope nhân sự được kiểm tra ở server-side: nhân sự tự xem/ghi bản thân, tổ trưởng theo assignment hiệu lực, quản lý/admin theo toàn xưởng; không dựa vào việc ẩn nút trên UI.
- Danh sách nhân sự và danh mục hình thức chấm công dùng RPC scope-filtered, không đọc trực tiếp toàn bộ `production_workers`.
- Các RPC trạng thái ngày, đảo bản ghi và danh mục hình thức cũng đã được bọc scope; implementation nội bộ bị thu hồi quyền gọi trực tiếp.
- Kiểm tra trạng thái ngày, ca trùng và chốt ngày dùng chung advisory lock theo nhân sự/ngày; các luồng ghi đồng thời không thể lọt qua kiểm tra rồi ghi sau chốt.
- Chỉ quản lý có quyền cập nhật trạng thái ngày/tiền ăn; quản lý không thể chốt một ngày hoàn toàn trống và chưa được phân loại.
- Màn ngày, bảng tháng và lịch sử hiển thị trạng thái ngày; trạng thái không được tính như một attendance fact có khối lượng bằng 0.
- Khi database chưa có RPC scope hoặc migration phụ trợ, giao diện ánh xạ lỗi PostgREST thành hướng dẫn tiếng Việt rõ ràng và khóa đúng thao tác phụ thuộc migration.
- Có thể xuất Excel trực tiếp theo tháng với sáu sheet: tổng hợp nhân sự, chi tiết chấm công, sản lượng theo sản phẩm, trạng thái ngày, tăng ca và chốt ngày; file chỉ chứa dữ liệu trong phạm vi quyền và không xuất chi phí khi người dùng không có quyền xem.
- Workspace local mới hợp nhất các luồng ngày công, giờ công, sản lượng, lịch sử và tăng ca trong cùng một màn hình; tab Tháng dùng ma trận nhân sự × ngày với cột nhân sự/header cố định để kéo ngang như Excel.
- Tab `Lịch sử` đọc append-only audit từ SQL local qua `GET /api/attendance/history?month=YYYY-MM`; các sự kiện tạo, duyệt, từ chối, khóa, đảo, tăng ca, trạng thái ngày và chốt ngày được giữ để đối soát. Nhánh public không gọi endpoint này và không ghi/đọc thêm dữ liệu Supabase.
- Sheet tổng hợp không còn bỏ sót nhân sự chỉ có trạng thái nghỉ hoặc tăng ca; đồng thời tách số ngày theo trạng thái, ngày đủ tiền ăn, phút tăng ca đã duyệt/chờ duyệt và số ngày quản lý đã chốt.
- Danh mục nhân sự trên bộ lọc/tháng/lịch sử được hợp nhất từ nhân sự đang hoạt động, attendance lịch sử, trạng thái ngày, tăng ca và chốt ngày; nhân sự đã nghỉ nhưng còn dữ liệu vẫn tra cứu được.
- Bộ lọc hình thức chỉ suy ra từ attendance lịch sử khi nhân sự đã có bản ghi; nhân sự chưa có attendance dùng cấu hình hình thức hoặc mặc định theo loại nhân sự, không bị suy ra sai từ trạng thái hiện tại.
- Ô tháng có trạng thái `Có mặt` hoặc `Ngày lễ` vẫn mở nhanh form ghi attendance; trạng thái `Vắng/Nghỉ` giữ thao tác chỉnh trạng thái để không ghi nhầm công.
- Bảng ngày hiển thị riêng trạng thái chốt (`Nhân sự đã chốt`, `Quản lý đã chốt`, `Đã mở lại`) kể cả khi ngày đó chưa có attendance.
- Export dùng toàn bộ danh mục nhân sự trong phạm vi quyền (không dùng danh sách đã lọc theo hình thức cho phần metadata), nên sheet trạng thái/tăng ca/chốt ngày không bị mất tên hoặc rơi về placeholder.
- Bố cục workbook đã được sửa để tiêu đề nằm đúng hàng 1-2, header/filter đúng hàng 4; không còn lỗi ExcelJS tự chèn header trước tiêu đề.
- Điều hướng trang đã tách hẳn khỏi lệnh sản xuất; tab dùng nhãn ngắn `Ngày`, `Tháng`, `Lịch sử`, `Tăng ca` và các nút phụ thu gọn trên màn hình nhỏ.
- Form chặn sớm ngày công/giờ chuẩn/sản lượng ngoài giới hạn trước khi gửi, giảm lỗi nhập liệu và không chờ database trả lỗi.
- RPC tương thích `record_factory_attendance` không còn nhận `HOUR` vì đường gọi này không có giờ đến/giờ về; chấm theo giờ bắt buộc đi qua `record_factory_hour_attendance`.
- Resolver mức công được giữ riêng cho các RPC server-side; client không thể gọi trực tiếp để đọc rate, trong khi luồng chấm công vẫn snapshot được mức công hiệu lực cho người có quyền vận hành.

## Quy tắc đang áp dụng

| Hình thức | Công thức | Giới hạn hiện tại |
| --- | --- | --- |
| Theo ngày | `lương tháng x (ngày công x giờ chuẩn x 60) / phút sản xuất tháng` | tối đa 2 ngày/người/ngày |
| Theo giờ | `đơn giá giờ x giờ làm thực tế` | tối đa 24 giờ/người/ngày |
| Theo sản lượng | `đơn giá sản phẩm x sản lượng` | công việc/sản phẩm bắt buộc |

Giờ qua 00:00 chưa được hỗ trợ. Hệ thống phải báo lỗi rõ ràng vì policy hiện tại chỉ cho ca trong cùng ngày. Không tự đổi sang quy tắc ca đêm khi chưa có quyết định nghiệp vụ.

## Bằng chứng source

- Workspace hợp nhất và các tab Excel/audit: `src/components/AttendanceWorkspaceV2.tsx`
- Local SQL adapter và API client: `server/index.ts`, `src/lib/local-api.ts`, `src/lib/production-execution.ts`
- UI và tổng hợp: `src/components/FactoryAttendancePanel.tsx`
- Hàm tính thuần và tổng hợp: `src/lib/factory-attendance.ts`
- API/RPC fallback: `src/lib/production-execution.ts`
- Kiểu dữ liệu: `src/integrations/supabase/production-execution-types.ts`
- Bảng/RPC độc lập: `supabase/migrations/20260829150000_factory_attendance_independent.sql`
- Time-clock: `supabase/migrations/20260829170000_factory_attendance_time_clock.sql`
- Concurrency/idempotency hardening: `supabase/migrations/20260907120000_factory_attendance_concurrency_hardening.sql`
- Trạng thái ngày/tiền ăn: `supabase/migrations/20260907130000_factory_attendance_day_status.sql`
- Invariant guards: `supabase/migrations/20260907140000_factory_attendance_invariant_guards.sql`
- Đồng nhất trạng thái và loại `REJECTED`: `supabase/migrations/20260907150000_factory_attendance_status_consistency.sql`
- Hardening chốt ngày và thu hồi quyền RPC cũ: `supabase/migrations/20260907160000_factory_attendance_rejected_fact_closure_hardening.sql`
- ACL hardening cho RPC chấm công: `supabase/migrations/20260907170000_factory_attendance_acl_hardening.sql`
- Scope hardening cho worker/read/write RPC: `supabase/migrations/20260907180000_factory_attendance_scope_hardening.sql`
- Hoàn tất scope cho day-status, reversal và attendance methods: `supabase/migrations/20260907190000_factory_attendance_scope_completion.sql`
- Chặn chấm giờ thiếu giờ đến/giờ về: `supabase/migrations/20260907200000_factory_attendance_hour_entry_guard.sql`
- Ranh giới resolver mức công và thu hồi quyền gọi trực tiếp: `supabase/migrations/20260907220000_factory_attendance_rate_resolution_boundary.sql`
- Kiểm thử PostgreSQL: `supabase/tests/labor_costing_test.sql`
- Kiểm thử ACL: `supabase/tests/factory_attendance_acl_test.sql`

## Trạng thái database đang dùng

Schema remote đã được audit read-only và còn thiếu ít nhất các migration time-clock, workflow/concurrency và trạng thái ngày. Vì vậy:

- Bản ghi cũ có thể xem ngày/giờ công, nhưng RPC tương thích không thể trả giờ đến/giờ về.
- UI hiển thị cảnh báo khi đang dùng endpoint tương thích, không giả vờ rằng giờ vào/ra đã có.
- Tạo bản ghi theo giờ sẽ báo lỗi rõ ràng nếu RPC `record_factory_hour_attendance` chưa tồn tại.
- Không chạy `supabase db push` hoặc `migration repair` trong trạng thái lịch sử migration đang lệch.

## Kiểm tra vận hành local

- Khởi động đúng stack bằng `npm run dev:local`; script giữ UI ở `8090`, API ở `8787` và PostgreSQL local ở `55432`.
- Health check: `GET http://127.0.0.1:8787/health` phải trả `backend=local-postgresql`.
- Kiểm tra audit: `GET http://127.0.0.1:8787/api/attendance/history?month=2026-09`.
- Nếu API đang chạy từ phiên cũ, dừng phiên đó rồi chạy lại `npm run local:api` với `LOCAL_DATABASE_URL` local; không cần và không được restart/migrate Supabase public.

## Chuỗi triển khai cần review trước khi chạy staging

Gói chain local và operator production read-only nằm tại `scripts/test-attendance-payroll-chain.ps1` và `docs/attendance-payroll-operations/`. Runner chỉ dùng PostgreSQL Docker disposable; package operator không tự động thao tác remote và không thay thế phê duyệt/reconcile.

Chỉ thực hiện trên database backup/staging sau khi reconcile migration history:

1. `20260829170000_factory_attendance_time_clock.sql`
2. `20260906090000_payroll_master_data_foundation.sql`
3. `20260906100000_payroll_master_data_security_workflow_hardening.sql`
4. `20260906110000_payroll_master_data_completion.sql`
5. `20260906120000_payroll_master_data_immutability_and_audit.sql`
6. `20260907100000_factory_attendance_workflow.sql`
7. `20260907120000_factory_attendance_concurrency_hardening.sql`
8. `20260907130000_factory_attendance_day_status.sql`
9. `20260907140000_factory_attendance_invariant_guards.sql`
10. `20260907150000_factory_attendance_status_consistency.sql`
11. `20260907160000_factory_attendance_rejected_fact_closure_hardening.sql`
12. `20260907170000_factory_attendance_acl_hardening.sql`
13. `20260907180000_factory_attendance_scope_hardening.sql`
14. `20260907190000_factory_attendance_scope_completion.sql`
15. `20260907200000_factory_attendance_hour_entry_guard.sql`
16. `20260907210000_factory_attendance_team_approval.sql`
17. `20260907220000_factory_attendance_rate_resolution_boundary.sql`

Sau mỗi migration cần kiểm tra schema cache, quyền/RLS và smoke test tạo giờ, xem tháng, retry idempotent và reversal. Chưa được apply trực tiếp production cho tới khi có phê duyệt thao tác cụ thể.

## Chưa thuộc MVP hiện tại

Các phần sau là Sprint 3/4, chưa nên suy đoán công thức hoặc bật nhầm trong bảng hiện tại:

- Tính tiền tăng ca theo hệ số/policy (module hiện tại chỉ ghi nhận phút và duyệt trạng thái);
- adjustment sau duyệt;
- payroll engine và payslip.

Workflow/chốt ngày/tăng ca/trạng thái ngày đã có migration cục bộ, nhưng cần apply staging/production có kiểm soát trước khi coi là sẵn sàng vận hành.

## Kiểm thử đã chạy

- `npm run build`: PASS.
- ESLint các file attendance/API liên quan: PASS.
- `npm run test:labor-costing`: PASS trên PostgreSQL Docker cô lập.
- Hồi quy RPC tương thích: PASS; `record_factory_attendance(..., 'HOUR', ...)` bị từ chối, chấm giờ bắt buộc có giờ đến/giờ về qua RPC chuyên dụng.
- Hồi quy `REJECTED`: PASS; bản ghi bị từ chối không giữ ca/giới hạn và có thể ghi lại cùng khoảng giờ.
- Hồi quy ngày nghỉ/lễ: PASS; tăng ca bị chặn trên ngày vắng/nghỉ và được phép trên ngày lễ.
- Kiểm tra ACL RPC: PASS trên PostgreSQL cô lập; `anon` bị từ chối, API chỉ giữ các RPC công khai cần thiết, resolver mức công bị thu hồi quyền gọi trực tiếp.
- Kiểm tra scope hành vi và duyệt theo tổ: PASS trên PostgreSQL cô lập; admin thấy toàn bộ worker, operator chỉ thấy worker được liên kết, tổ trưởng chỉ duyệt worker có assignment hiệu lực; đọc/ghi/chốt/đảo ngoài scope đều bị chặn.
- `npm run build`: PASS sau khi hoàn thiện ánh xạ lỗi migration ở trang và panel chấm công.
- ESLint các file attendance/API liên quan: PASS sau khi hoàn thiện ánh xạ lỗi migration.
- `npm run test:production`: PASS; luồng lệnh sản xuất và attendance legacy không hồi quy.
- `npm run test:payroll-master-data`: PASS; các RPC hồ sơ nhân sự/mức công vẫn tương thích.
- `npm run test:factory-attendance-acl`: PASS sau hardening duyệt theo tổ và ranh giới resolver mức công.
- `npm run test:factory-attendance-export`: PASS; xác nhận đủ năm sheet, đúng header/filter, đủ nguồn nhân sự và serialize workbook thành công.
- ESLint riêng toàn bộ file attendance/API/export: PASS.
- `git diff --check`: PASS; chỉ còn cảnh báo chuyển LF/CRLF của worktree Windows.
- `npx tsc --noEmit -p tsconfig.app.json`: vẫn FAIL ở các lỗi relation typing tồn tại trước đó trong fabric, quotes, cash-flow và transactions; không có lỗi attendance mới được xác nhận.

## Migration local đã hoàn thiện

- `supabase/migrations/20260907100000_factory_attendance_workflow.sql`
- `supabase/migrations/20260907120000_factory_attendance_concurrency_hardening.sql`
- `supabase/migrations/20260907130000_factory_attendance_day_status.sql`
- `supabase/migrations/20260907140000_factory_attendance_invariant_guards.sql`
- `supabase/migrations/20260907150000_factory_attendance_status_consistency.sql`
- `supabase/migrations/20260907160000_factory_attendance_rejected_fact_closure_hardening.sql`
- `supabase/migrations/20260907170000_factory_attendance_acl_hardening.sql`
- `supabase/migrations/20260907180000_factory_attendance_scope_hardening.sql`
- `supabase/migrations/20260907190000_factory_attendance_scope_completion.sql`
- `supabase/migrations/20260907200000_factory_attendance_hour_entry_guard.sql`
- `supabase/migrations/20260907210000_factory_attendance_team_approval.sql`
- `supabase/migrations/20260907220000_factory_attendance_rate_resolution_boundary.sql`

Các migration này chưa được triển khai production trong phase hiện tại. Cần backup, reconcile migration history và smoke test staging trước khi apply.
