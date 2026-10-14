# PAYROLL SPRINT 1 - STAGING ACCEPTANCE

Ngày cập nhật: 2026-09-07  
Phạm vi: employee/product/rate/RBAC foundation. Chưa tính payroll, chưa import dữ liệu, chưa triển khai production.

## 1. Kết luận hiện tại

**Verdict: NOT READY FOR SPRINT 2**

Code và migration Sprint 1 đã qua kiểm thử PostgreSQL cô lập. Workbook nguồn có 126/126 mã đơn giá hợp lệ và không bị thay đổi khi dry-run. Đối chiếu read-only với catalog thật của CRM chỉ map exact được 1/126 mã; 125 mã không tồn tại dưới cùng SKU. Mapping nhân sự pilot cũng chưa hoàn tất, nên chưa được import đơn giá hoặc sang Sprint 2.

Không migration nào trong Sprint 1 được chạy lên Supabase/staging/production trong phiên làm việc này.

## 2. Phạm vi đã hoàn thiện

- Tái sử dụng production_workers, không tạo bảng employee trùng.
- Tái sử dụng products, không tạo bảng product/SKU trùng.
- Phân loại lương có hiệu lực theo thời gian.
- Lương tháng/giờ theo worker có draft, approval, effective date và audit.
- Đơn giá sản phẩm có draft, approval, effective date và audit.
- BHXH fixed amount theo worker và thời gian.
- Tài khoản ngân hàng lưu text, trả về masked projection.
- Payroll capabilities được kiểm tra server-side.
- Approved worker rate không thể insert/update/delete trực tiếp.
- Thay thế mức lương cũ lưu audit before_data và after_data.
- API danh mục sản phẩm mới dùng list_payroll_products_v2; API v1 được giữ nguyên để không làm gãy dependency cũ.
- Trang chấm công chỉ hiển thị thao tác mức công khi có payroll_rate_manage và chuyển người dùng tới quy trình draft/approval ở trang cấu hình tiền lương.

## 3. Chuỗi migration cần thử trên staging

Theo đúng thứ tự:

1. `20260829170000_factory_attendance_time_clock.sql` (dependency remote còn thiếu)
2. `20260906090000_payroll_master_data_foundation.sql`
3. `20260906100000_payroll_master_data_security_workflow_hardening.sql`
4. `20260906110000_payroll_master_data_completion.sql`
5. `20260906120000_payroll_master_data_immutability_and_audit.sql`

Các migration trên phụ thuộc các migration cost/inventory/BOM/production/labor/attendance trước đó đã được liệt kê trong scripts/test-payroll-master-data.ps1.

### Trạng thái migration remote đo ngày 2026-09-07

Kiểm tra read-only bằng `supabase migration list --linked` xác nhận CLI đang link project `kmxfljxsmnozvvgypdei`. Không có migration nào được apply trong lần kiểm tra này.

- Remote đã có các migration production/labor/attendance tới `20260829150000`.
- Remote chưa có `20260829170000_factory_attendance_time_clock.sql`.
- Remote chưa có bốn migration Payroll Sprint 1 từ `20260906090000` tới `20260906120000`.
- Schema-only dump xác nhận `factory_attendance_records` và `worker_compensation_rates` cơ bản đã tồn tại, nhưng chưa có `check_in`, `check_out`, `break_minutes`, `list_payroll_capabilities` hoặc capability `payroll_rate_manage`.
- Lịch sử toàn repository đang lệch lớn: 13 timestamp khớp cả local/remote, 138 local-only và 153 remote-only theo CLI. Phần lớn lịch sử cũ dùng timestamp/tên file không đồng nhất, vì vậy không được dùng `supabase db push` trực tiếp trước khi reconcile migration history.
- Có một migration remote gần đây `20260810030914` không có file local tương ứng; phải xác định nội dung trước khi lập staging baseline.
- `supabase db push --linked --dry-run --skip-vault` không thay đổi database nhưng đã thất bại với `LegacyDbPushMissingLocalError`. CLI không thể tạo danh sách apply đáng tin cậy trong trạng thái hiện tại.
- Không chạy hàng loạt `supabase migration repair --status reverted ...` theo gợi ý tự động của CLI. Thao tác đó sửa migration history remote và chỉ được cân nhắc sau khi đối chiếu schema, backup và duyệt từng version.

## 4. Kết quả kiểm thử local

| Kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| Targeted ESLint Payroll/Attendance/API | PASS | 0 error |
| Production build | PASS | Vite build hoàn tất; còn cảnh báo chunk lớn hiện hữu |
| Payroll master-data PostgreSQL test | PASS | Docker PostgreSQL cô lập |
| Labor costing PostgreSQL test | PASS | Docker PostgreSQL cô lập |
| Production execution PostgreSQL test | PASS | Docker PostgreSQL cô lập |
| Excel dry-run syntax | PASS | Python standard library, không cần package Excel ngoài |
| Excel mapping state test | PASS | Kiểm tra MAPPED, AMBIGUOUS, MISSING |
| Full TypeScript | FAIL - PRE-EXISTING | Lỗi relation typing tại fabric, quotes, cash-flow và transactions; không có lỗi Payroll mới |

## 5. Kết quả dry-run Excel hiện tại

Nguồn: Copy of luong_2026 (1).xlsx

- SHA-256 trước và sau: DAAE28839215C41E3817096E181E9F84A2541158EDCF8D47550CB6AF1FFCA1C6.
- Source unchanged: YES.
- Dòng đơn giá: 126.
- Dòng hợp lệ: 126.
- Mã hợp lệ duy nhất: 126.
- Mã trùng trong don-gia-moi: 0.
- Dòng lỗi: 0.
- Catalog Product CRM: 1.773 dòng, 0 dòng thiếu SKU.
- Mapped exact: 1/126.
- Ambiguous: 0/126.
- Missing: 125/126.
- Mapping verdict: `REVIEW REQUIRED - NOT APPROVED FOR IMPORT`.
- Workbook giữ nguyên SHA-256 trước/sau: YES.

Chi tiết đầy đủ nằm tại docs/payroll-sprint-1-excel-dry-run.md.

Danh sách 125 mã cần owner đối soát nằm tại `docs/payroll-product-mapping-review.csv`. Các cột quyết định và CRM product ID được để trống có chủ ý; file không tự suy đoán mapping.

### Rủi ro tài khoản ngân hàng trong Excel

- luong_tong: 109 identifier không trống, gồm 61 text và 48 numeric.
- nv đóng bhxh: 9 identifier không trống, gồm 7 text và 2 numeric.
- Tổng cộng 50 ô numeric cần đối chiếu nguồn; số 0 đầu đã mất trong Excel không được tự khôi phục bằng suy đoán.
- Dry-run không in hoặc log giá trị tài khoản.

## 6. Cách lấy catalog staging an toàn

Phép đo ngày 2026-09-07 đã dùng dump read-only giới hạn đúng hai bảng `products` và `price_lists`, sau đó tạo catalog tối giản ngoài repository. Không có bảng khách hàng, đơn hàng, tài chính hoặc dữ liệu nhân sự trong dump này.

Để làm mới phép đo, chỉ xuất dữ liệu sản phẩm, không xuất khách hàng hoặc dữ liệu cá nhân:

~~~sql
SELECT
  p.id::text AS id,
  p.sku::text AS sku,
  p.name,
  p.price_list_id::text AS price_list_id,
  pl.name AS price_list_name,
  pl.year AS price_list_year
FROM public.products p
LEFT JOIN public.price_lists pl
  ON pl.id = p.price_list_id
 AND pl.tenant_id = p.tenant_id
WHERE p.tenant_id = 'default'
ORDER BY p.sku, p.name, pl.year DESC NULLS LAST;
~~~

Lưu kết quả thành UTF-8 JSON hoặc CSV ở vị trí ngoài repository nếu có dữ liệu nội bộ không nên commit.

Chạy lại:

~~~powershell
python scripts/payroll-excel-dry-run.py --workbook "C:\path\Copy of luong_2026 (1).xlsx" --catalog "C:\path\payroll-products-staging.csv" --expected-hash DAAE28839215C41E3817096E181E9F84A2541158EDCF8D47550CB6AF1FFCA1C6 --review-owner "Chủ hệ thống CRM"
~~~

Matching chỉ chuẩn hóa Unicode, bỏ khoảng trắng đầu/cuối và không phân biệt hoa/thường. Không bỏ ký tự, không so tên gần giống và không fuzzy match.

## 7. Staging acceptance checklist

| Gate | Trạng thái | Điều kiện hoàn tất |
|---|---|---|
| Backup staging và ghi lại migration history | BLOCKED | CLI xác nhận migration history local/remote lệch lớn; cần backup/restore test và baseline/reconcile trước khi apply |
| Apply đủ migration theo thứ tự | BLOCKED | Dry-run hiện lỗi `LegacyDbPushMissingLocalError`; không dùng `db push` hay `migration repair` hàng loạt, chỉ apply danh sách đã review sau khi reconcile history |
| Schema/index/constraint/trigger/RLS | PENDING | So sánh với migration và test quyền bằng JWT thật |
| Admin capability | LOCAL PASS | Xác nhận trên staging |
| Manager capability | LOCAL PASS | Xác nhận trên staging |
| Accountant capability | LOCAL PASS | Xác nhận bank/BHXH đúng phạm vi |
| Team leader/delegated permission | LOCAL PASS | Xác nhận chỉ thấy worker thuộc tổ |
| Employee isolation | LOCAL PASS | Xác nhận không đọc dữ liệu người khác |
| Worker pilot mapping | BLOCKED | Mỗi nhân sự pilot có code, location, position, type, status |
| Product mapping 126 mã | BLOCKED | 1 mapped exact, 0 ambiguous, 125 missing; từng mã missing cần được map vào Product hiện hữu hoặc có quyết định danh mục do owner duyệt, không tạo Product trùng tự động |
| Piece-rate effective-date boundary | LOCAL PASS | Lặp lại trên staging |
| Approved-rate immutability | LOCAL PASS | Lặp lại trên staging |
| Bank account text/masking/audit | LOCAL PASS | Đối chiếu 50 ô Excel numeric với chứng từ nguồn |
| Attendance permission UX | LOCAL PARTIAL | Trang chấm công chạy; tài khoản hiện tại không thấy nút Mức công. Route `/payroll-settings?tab=worker-rates` mở đúng nhưng database đang dùng chưa có `list_payroll_capabilities`, nên test tab và hai nhóm quyền vẫn chờ migration staging |
| No production mutation | PASS | Chưa deploy hoặc import production |

## 8. Kịch bản smoke test staging

1. Đăng nhập Admin, Manager, Accountant, Team Leader và Employee bằng tài khoản test.
2. Kiểm tra list_payroll_capabilities() trả đúng source ROLE, DELEGATED hoặc NONE.
3. Tạo worker rate draft, sửa draft, hủy draft.
4. Tạo lại draft, approve, sau đó thử update/delete trực tiếp và xác nhận bị từ chối.
5. Tạo phiên bản mới có ngày hiệu lực sau, xác nhận bản trước thành RETIRED và audit có before/after.
6. Tạo product piece rate trên SKU duy nhất; SKU trùng price list phải hiện AMBIGUOUS_SKU.
7. Tạo tài khoản bắt đầu bằng 00, reload và xác nhận vẫn là text; audit không chứa số đầy đủ.
8. Trên trang chấm công, tài khoản chỉ có production_worker_manage không được thấy nút chỉnh mức công.
9. Tài khoản có payroll_rate_manage mở nút Mức công và vào đúng tab worker-rates.
10. Xác nhận không có request trực tiếp nào tạo approved rate từ form chấm công.

### Kết quả smoke test local ngày 2026-09-07

- `/production-attendance` tải thành công bằng phiên đăng nhập hiện tại.
- Tài khoản hiện tại không hiển thị nút `Mức công`; không có đường tạo/sửa mức công trực tiếp trên màn chấm công.
- `/payroll-settings?tab=worker-rates` được router nhận đúng, nhưng API trả lỗi `Could not find the function public.list_payroll_capabilities without parameters in the schema cache`.
- Đây là blocker schema đã dự kiến: bốn migration Sprint 1 chưa được apply vào database mà app local đang dùng. Chưa thể coi role/RLS/RPC smoke test là PASS cho tới khi chạy trên staging đã backup.
- Migration list remote đồng thời cho thấy `20260829170000_factory_attendance_time_clock.sql` cũng chưa được apply; chuỗi staging phải bao gồm dependency này trước Payroll Sprint 1.

## 9. Forward-fix và rollback safety

- Mỗi migration chạy trong transaction; nếu một bước lỗi phải dừng, không bỏ qua.
- Không chỉnh file migration đã apply. Mọi sửa chữa sau staging dùng migration timestamp mới.
- Không dùng down migration xóa bảng/cột có dữ liệu.
- Nếu RPC v2 có lỗi, giữ RPC v1 hoạt động và phát hành RPC v3 bằng migration mới.
- Nếu quyền sai, khóa route bằng permission trước khi mở lại; không cấp broad table DML để chữa tạm.
- Không import rate/worker/bank cho đến khi dry-run được owner duyệt.

## 10. Điều kiện đổi verdict

Chỉ đổi thành READY FOR SPRINT 2 khi:

1. Migration dependency `20260829170000` và bốn migration Sprint 1 apply sạch trên staging có backup, sau khi migration history đã được reconcile.
2. Role/RLS/RPC smoke test staging PASS.
3. 126 mã Excel đã có số mapped/ambiguous/missing thật.
4. Mỗi ambiguous/missing có quyết định và owner; không tạo Product trùng.
5. Nhân sự pilot và tài khoản ngân hàng được đối chiếu.
6. Owner ký duyệt effective date mở đầu cho đơn giá.
7. Full TypeScript regression được xử lý hoặc được chấp nhận chính thức như debt ngoài Sprint 1.
