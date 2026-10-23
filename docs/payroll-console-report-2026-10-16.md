# Điều hành và đối soát lương theo tháng — 16/10/2026

Phạm vi đợt này là đợt 1–2 của `payroll-flow-business-redesign-plan-2026-10-16.md`: hàng đợi công việc theo kỳ, một thao tác chính theo trạng thái, hồ sơ từng người và đối soát số tiền chính xác. Đợt 3–4 cần quyết định nghiệp vụ và mẫu ngân hàng; các ví dụ cần chốt nằm trong `payroll-business-decisions-2026-10-16.md`.

## Luồng đã triển khai

1. Mở `/payroll-settings?tab=runs`, chọn tháng và cơ sở. Preflight tự tải theo đúng phạm vi/quyền, có thời điểm kiểm tra và nút kiểm tra lại.
2. Xử lý hàng đợi theo bốn nhóm: cấu hình/lịch, nguồn công/sản lượng, khoản cộng/trừ và ngoại lệ đối soát. Lỗi trùng chỉ hiện một lần; từng lỗi có đường dẫn đúng người/ngày và quay về đúng kỳ. Lỗi cũ thiếu `resolution_target` được phân loại theo mã lỗi; đích tường minh từ máy chủ luôn được ưu tiên.
3. Tính thử rồi đối soát bảng gọn, lọc thay đổi/ngoại lệ/thanh toán âm hoặc 0/thiếu ngân hàng xác minh. Mở từng người để xem item, công thức và snapshot nguồn/chính sách. So sánh với bản trước tương thích, kể cả bản `SUPERSEDED`; không đoán phạm vi của bản cũ thiếu metadata.
4. Chỉ cho tiến tới khóa khi bản xem trước còn `CURRENT`, đọc đối soát thành công, hết lỗi chặn và đã kiểm tra không bỏ sót nhân sự thực ngoài bản tính. Nguồn hợp lệ thay đổi cũng làm bản cũ thành `STALE`, dù không sinh lỗi preflight. Máy chủ tiếp tục kiểm tra nguyên giao dịch khi khóa.

Lịch sử, nhập Excel và ngày chuẩn đối chiếu nâng cao nằm trong `Lịch sử & công cụ`. Trường hợp lọc một cơ sở nhưng còn nhân sự đủ điều kiện ngoài bản tính có danh sách/tổng số và lối chọn toàn bộ cơ sở; khoản chờ ngoài phạm vi vẫn chặn khóa toàn kỳ. Các kiểm tra này là phép đọc nguồn hiện có, không tạo nguồn duyệt thứ hai.

`Nhân sự & mức lương` mở danh sách nhẹ trước; khi chọn một người mới tải chi tiết người đó. Cache và trạng thái biểu mẫu gắn với người dùng, quyền và worker; khi tải lỗi hoặc chưa đủ nguồn được cấp quyền, thao tác phụ thuộc bị khóa và có thử lại. Số nháp ở danh sách được ghi rõ chỉ là **phân loại/hồ sơ**, không giả định đã đếm nháp đơn giá/BHXH.

Màn duyệt bộ hiển thị phiên bản trước → sau, ID thành phần và khoảng hiệu lực giữ lại/thay thế. Duyệt vẫn dùng API giao dịch hiện hữu. Đề nghị ngân hàng chỉ đọc khi người có quyền bấm đối chiếu, so sánh có che số tài khoản và có tham chiếu hồ sơ/revision/ngày duyệt. Điền đề nghị chỉ đổi biểu mẫu nháp, vẫn cần ngày hiệu lực/lý do và xác minh riêng. Tham chiếu nguồn không phải bản sao bất biến của toàn bộ hồ sơ cá nhân.

Các tệp mới: `server/payroll-reconciliation.ts`, `src/lib/payroll-reconciliation.ts`, `src/components/payroll/PayrollMonthWorkbench.tsx`, `PayrollWorkerRoster.tsx`, `PayrollBankProposal.tsx`, `scripts/test-payroll-console-isolated.mjs`. Các điểm tích hợp sửa trong `server/index.ts`, `server/payroll-access.ts`, `src/lib/local-api.ts`, `src/pages/PayrollSettingsPage.tsx`, `src/components/payroll/PayrollBundleReview.tsx`, `src/pages/ProductionAttendanceV2Page.tsx`, `src/components/AttendanceWorkspaceV2.tsx`; `server/payroll-snapshot.ts` chỉ làm rõ điều kiện dùng phép đọc fingerprint. Harness hiện hữu thêm nhánh console.

## Bảo toàn dữ liệu

- Không đổi công thức tính lương, không thêm migration, không sửa migration 052–055 đã áp dụng.
- Giữ quyền, audit, duyệt bộ nguyên giao dịch, ngày hiệu lực, preflight, fingerprint nguồn, khóa toàn kỳ và snapshot đã khóa.
- Ngân hàng tự khai chỉ là đề nghị lấy từ hồ sơ đã duyệt. Tạo nháp và xác minh vẫn là các thao tác riêng.
- Không đồng bộ dữ liệu từ xa, đẩy GitHub hay cập nhật VPS.

Backup local trước thay đổi: `C:\Users\Lenovo\Desktop\Tổng hợp dự án\crm-joliefam-main (1)\backups\crm-before-payroll-console-20261016-214545.dump`, PostgreSQL custom format, 7.996.491 byte; danh sách `pg_restore` đọc được, 761 dòng.

Bản sao các tệp tồn tại trước đợt sửa: `C:\Users\Lenovo\Desktop\Tổng hợp dự án\crm-joliefam-main (1)\outputs\payroll-console-baseline-20261016-214818`. Worktree đã có thay đổi từ các đợt trước; không reset hay gom chúng thành thay đổi mới của đợt này.

## Kiểm chứng

Reviewer độc lập đã đối chiếu manifest backend/giao diện, gồm ba tệp sửa cuối để bổ sung kiểm tra nhân sự ngoài phạm vi; không còn finding P1/P2 trong phạm vi. Các bộ kiểm thử có ghi dữ liệu chỉ chạy trong database/role tạm riêng, chặn outbound, rồi dọn tài nguyên của lần chạy. Chi tiết kết quả backend, các lần chạy lại và hash kiểm thử nằm trong `payroll-console-tests-2026-10-16.md`.

| Tệp production | SHA256 |
|---|---|
| `server/index.ts` | `0E46781B9D417B6D4648F8A1946EC0EC2138224A2FE0326A6E6E1F363256AE91` |
| `server/payroll-access.ts` | `F11F5F459FF92087EFA4F769E02289784FBC06231266B2D56554CB65AF96A92A` |
| `server/payroll-reconciliation.ts` | `C1EB53456E3437BF624ED47AB25E73BF15CF92E01070BFB45E7D17C50D596ACF` |
| `server/payroll-snapshot.ts` | `02A516015AA7465E00D9F7BF8096430A0F05ABF676A677D1C020853E10C05AD2` |
| `src/pages/PayrollSettingsPage.tsx` | `DCC769A4EA65D536ACA39D6FF25204609871929DDCD103CFD000E80DD9E1B006` |
| `src/components/payroll/PayrollMonthWorkbench.tsx` | `CAEBA3156953AC8473B487DC29B136C28302CF7D5F1AA9CD49081E7BD071911E` |
| `src/components/payroll/PayrollWorkerRoster.tsx` | `CFED0E4A7D11B553C8A8FD3186F273D74039FE05AA38F6C8D86A32EA7D5B505A` |
| `src/components/payroll/PayrollBankProposal.tsx` | `F3B68E056B8BF17FE7D3A03E0A86E9672E3C4B2082C828AAFE635E9FF3DFBDF2` |
| `src/components/payroll/PayrollBundleReview.tsx` | `96E92649D555564E1D5754DFC5748E8415468C0BD13677B57F73CA19E573D699` |
| `src/components/AttendanceWorkspaceV2.tsx` | `A5380D2D48846125CBED14E708084B1780D7210E02E52524B7BBEFF6AA47DA42` |
| `src/pages/ProductionAttendanceV2Page.tsx` | `99EB6DF4A5A0CF7217636A18CB6EF7E77FD718130C5C751886212BCAF2C935D2` |
| `src/lib/payroll-reconciliation.ts` | `4B38CA999C5C2F5CCA27D6442315F07383EEBBBE48BDC87E40A536758A900CDE` |
| `src/lib/local-api.ts` | `901C554B2AC77A4F8C495638D03B524B71B93F19637D2B84E330979554D87C26` |

API đối soát đọc trong giao dịch `REPEATABLE READ READ ONLY`, trả tiền dưới dạng chuỗi thập phân từ PostgreSQL. Bản so sánh là run trước tương thích theo `run_number`, gồm cả `SUPERSEDED`; thiếu metadata phạm vi thì báo không thể so sánh. CSV giữ chính xác số tiền và có dòng cho người không có item. Không bổ sung trạng thái động vào API chi tiết run cũ.

Trên API đọc mới, `freshness` chỉ kiểm tra PREVIEW; `scope_guard` dùng đúng hàm eligibility, worker ID thực trong records và regex loại fixture của guard khóa hiện hữu. Với LOCKED/SUPERSEDED, hai kiểm tra này trả `NOT_APPLICABLE` cố định. Cảnh báo ngân hàng hiện tại được tách riêng khỏi kết quả lương bất biến.

Đề nghị ngân hàng chỉ dành cho quyền `payroll_bank_manage`, từ hồ sơ APPROVED đúng revision và người dùng còn hoạt động; không trả toàn bộ hồ sơ. Cảnh báo thiếu tài khoản được tra từ dữ liệu tài khoản hiện tại với khoảng hiệu lực tại ngày cuối kỳ, không phải snapshot ngân hàng bất biến của run.

TypeScript app/server, lint toàn bộ tệp sửa và build giao diện `envDir:false` đều đạt; sau các sửa cuối đã chạy lại TypeScript app/server, lint ba tệp và build. Đầu ra build cuối: `C:\Users\Lenovo\AppData\Local\Temp\crm-payroll-console-scope-build-8LSUHc`. Còn cảnh báo Browserslist cũ và chunk lớn hơn 500 kB; không thay dependency trong đợt này.

Tổng kiểm thử có đếm nhóm: **85/85** (console mới 13, integrity 10, optimization 13, simplification 15, policy 12, permission 22), cùng golden V2 và scope/concurrency đạt. Sau phần đọc scope cuối, tester build lại server rồi chạy lại console 13/13, integrity 10/10 và scope/concurrency. Các lần thay đổi/chạy lại được phân biệt trong báo cáo kiểm thử, không coi tất cả suite đều chạy lại sau mọi sửa chỉ đọc.

Lệnh kiểm tra tĩnh chính:

```powershell
npx.cmd tsc --noEmit -p tsconfig.app.json
npx.cmd tsc --noEmit -p tsconfig.server.json
npx.cmd eslint server/index.ts server/payroll-access.ts server/payroll-reconciliation.ts server/payroll-snapshot.ts src/pages/PayrollSettingsPage.tsx src/components/payroll/PayrollMonthWorkbench.tsx src/components/payroll/PayrollWorkerRoster.tsx src/components/payroll/PayrollBankProposal.tsx src/components/payroll/PayrollBundleReview.tsx src/components/AttendanceWorkspaceV2.tsx src/pages/ProductionAttendanceV2Page.tsx src/lib/payroll-reconciliation.ts src/lib/local-api.ts scripts/test-payroll-console-isolated.mjs scripts/test-payroll-integrity-isolated.mjs
```

Sau sửa scope cuối, chạy lại TypeScript cả hai project, cùng `npx.cmd eslint server/payroll-reconciliation.ts src/components/payroll/PayrollMonthWorkbench.tsx src/lib/payroll-reconciliation.ts`; đều exit 0, lint không cảnh báo.

Build dùng API `build` của Vite, `envDir:false`, `outDir` tạo bằng `mkdtemp` trong thư mục tạm. Build server/suite do tester chạy tuần tự; frontend và reviewer dùng đúng hash đã chốt. Coordinator kiểm tra lại đủ 15/15 hash (13 tệp production + hai script), không sai khác; manifest lưu thêm ở `C:\Users\Lenovo\Desktop\Tổng hợp dự án\crm-joliefam-main (1)\outputs\payroll-console-final-manifest-20261016.json`.

## Runtime local

Đã khởi động lại đúng tiến trình API của dự án sau các kiểm thử cuối, giữ Vite hiện có. API PID 32348 nghe `127.0.0.1:8787`; UI PID 26152 nghe `127.0.0.1:8090`. Dùng `npm.cmd run local:api` với `LOCAL_SYNC_AUTO=false`, `LOCAL_API_HOST=127.0.0.1`, `LOCAL_API_PORT=8787`; log xác nhận bộ đồng bộ tự động bị tắt.

`GET /health` trả `ok:true`, backend `local-postgresql`, database `crm_local`. `http://127.0.0.1:8090/payroll-settings` và module workbench qua Vite đều HTTP 200. Đây là kiểm tra HTTP/biên dịch module, không phải QA giao diện tương tác. Không tạo/duyệt/tính/khóa dữ liệu kinh doanh để smoke test. Không có migration mới cần áp dụng; chưa commit, đẩy GitHub hay triển khai VPS.

## Giới hạn nghiệm thu

- Chưa có QA trình duyệt tương tác mới trong đợt này; cần đối chiếu riêng bố cục 375/768/1440 px và thao tác bàn phím trước khi dùng kỳ thực tế.
- Trạng thái kiểm tra là kết quả lần tải gần nhất của đúng kỳ/phạm vi; không có subscription để bảo đảm đổi nguồn từ máy khác được phản ánh tức thì. Máy chủ luôn kiểm tra lại khi khóa.
- Chưa mở nghỉ hưởng lương/ngày lễ/quyết toán còn thiếu rule; chưa bổ sung điều chỉnh sau khóa, file ngân hàng hoặc xác nhận đã chi trả.
- Trước kỳ lương thật đầu tiên cần chạy song song với bảng đối soát hiện hành và xác nhận chênh lệch.
