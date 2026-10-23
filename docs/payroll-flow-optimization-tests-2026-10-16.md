# Kiểm thử tối ưu luồng lương và chấm công — 16/10/2026

Kết quả cuối: tất cả lệnh xác minh trên phiên bản cuối bên dưới kết thúc với exit code 0. Bộ mới đạt **13/13**, các bộ có đếm nhóm đạt tổng cộng **72/72**, cùng kiểm thử V2 và scope/concurrency đạt. Lỗi TypeScript phát hiện trong lượt kiểm tra trung gian đã được sửa và kiểm tra lại thành công.

Kiểm thử API chỉ dùng database PostgreSQL riêng, role không có quyền superuser và API cổng ngẫu nhiên. API kiểm thử bị tắt outbound fetch; không đọc file `.env`, không dùng dữ liệu kinh doanh, không gọi dịch vụ bên ngoài. Các fixture tự xóa database, role và API sau kiểm thử. Build giao diện dùng `envDir:false` và thư mục tạm riêng. Báo cáo này không xác nhận trạng thái triển khai hay migration của database CRM chính.

## Lệnh và kết quả

Chạy từ thư mục mã nguồn `crm-joliefam-main`.

| Lệnh | Kết quả thực tế |
|---|---|
| `npm run build:server` | Đạt, tạo server-dist và sao chép migrations trước khi chạy API kiểm thử |
| `node scripts/test-payroll-flow-optimization-isolated.mjs` | 13/13, fixture cleanup đạt |
| `node scripts/test-payroll-integrity-isolated.mjs --simplification` | 15/15, fixture cleanup đạt |
| `node scripts/test-payroll-integrity-isolated.mjs --policies` | 12/12, fixture cleanup đạt |
| `node scripts/test-payroll-integrity-isolated.mjs` | 10/10, fixture cleanup đạt |
| `node scripts/test-payroll-integrity-isolated.mjs --v2` | Đạt; 3 records, gross 6224230.769231, deductions 1000000, payment 5224231; fixture cleanup đạt |
| `node scripts/test-payroll-integrity-isolated.mjs --scope-concurrency` | Đạt: validation, canonical retries, roster lock, trigger049 và source-lock ordering; fixture cleanup đạt |
| `node scripts/test-permissions-isolated.mjs` | 22/22, exit 0 |
| `npx tsc --noEmit -p tsconfig.server.json` | Đạt |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt trên bản Settings `507E476B…` sau sửa tương thích; exit 0 |
| `npx eslint server/index.ts server/payroll-approval-history.ts server/payroll-bundle-approval.ts src/pages/MyAttendancePage.tsx src/pages/PayrollSettingsPage.tsx src/components/AttendanceWorkspaceV2.tsx src/components/payroll/PayrollBundleReview.tsx scripts/test-payroll-flow-optimization-isolated.mjs` | Đạt, không lỗi/cảnh báo |
| `npx eslint src/pages/MyAttendancePage.tsx src/pages/PayrollSettingsPage.tsx src/components/AttendanceWorkspaceV2.tsx` | Đạt; chạy lại sau các sửa P2 giao diện cuối |

Lệnh build giao diện cuối (PowerShell):

```powershell
node --input-type=module -e 'import {build} from "vite"; import {mkdtemp} from "node:fs/promises"; import {tmpdir} from "node:os"; import path from "node:path"; const outDir=await mkdtemp(path.join(tmpdir(),"crm-payroll-flow-final-build-")); await build({envDir:false,logLevel:"warn",build:{outDir,emptyOutDir:true}}); console.log("ISOLATED_FRONTEND_BUILD="+outDir);'
```

Build cuối đạt, đầu ra tại `C:\Users\Lenovo\AppData\Local\Temp\crm-payroll-flow-final-build-pG4udk`. Cảnh báo hiện có: dữ liệu Browserslist/caniuse-lite cũ và một số chunk lớn hơn 500 kB. Không cài/gỡ gói hay thay dependency để xử lý các cảnh báo này.

Trong lượt trung gian trên Settings `016987C9…`, TypeScript app phát hiện TS2550 tại dòng 1354: lib app chưa hỗ trợ `Object.hasOwn`. Người triển khai đổi hai chỗ thành `Object.prototype.hasOwnProperty.call`, giữ nguyên cách phân biệt thuộc tính vắng mặt với giá trị null và giữ nguyên tsconfig. Sau đó TypeScript app, lint ba file giao diện và build đều được chạy lại, đạt exit 0 trên hash cuối `507E476B…`. Không có nhóm API kiểm thử thất bại.

Kết quả thô được quan sát từ stdout của các công cụ trong phiên làm việc; không tạo file raw log lâu dài. Đây là bản ghi kết quả đã kiểm tra, không phải bản sao đầy đủ của stdout.

## Phạm vi 13 nhóm kiểm thử mới

- Duyệt bộ lương có hiệu lực tương lai giữ cấu hình, nguồn công đã tạo trước đó và số lương quá khứ 100.000; mức mới tạo ra 200.000. Thay thế giữa kỳ giữ hai phía, tính đúng tổng 1.000.000 cho bốn ngày ở các biên.
- Duyệt lẻ phân loại, hồ sơ, mức lương và BHXH giữ ngày/giá trị gốc; SQL xác nhận toàn bộ dữ liệu kinh doanh của bản tiếp nối khớp. Số numeric `1234567890123456.78` không mất độ chính xác qua JavaScript.
- Đơn giá sản phẩm bảo toàn các khoảng trái/phải và decimal; kiểm tra cả mã công không phân biệt hoa thường và nhánh product_id. Sản phẩm khác dùng cùng mã không bị thay đổi.
- Ép lỗi audit cuối transaction khôi phục cả bốn bảng, không để lại bản tiếp nối hay receipt. Retry đồng thời cùng yêu cầu tạo đúng một kết quả bền vững.
- Từ chối lịch sử giao ngày mơ hồ, kể cả bản xung đột chỉ nằm ở phần đuôi ngoài khoảng thay thế.
- Mỗi nguồn công, sản lượng, tăng ca và điều chỉnh đang chờ duyệt chặn preview trong phạm vi. Nguồn ngoài phạm vi cho phép tính thử có giới hạn nhưng chặn khóa toàn kỳ, kể cả nhân sự ngừng hoạt động chỉ có phiếu chờ. Preflight trả đúng mã nguồn cần xử lý.
- Từ chối qua API giải phóng các phiếu chờ để khóa được kỳ. Điều chỉnh nháp và điều chỉnh giao khoảng ngày cũng chặn; nháp vẫn hủy được qua API.
- Nguồn chờ thêm sau preview bị phát hiện lại khi khóa. Thao tác khóa và thêm nguồn đồng thời không cùng commit thành công.

Các suite backend chạy trên backend đã đóng băng. Ba file giao diện được sửa P2 sau đó; TypeScript app, lint ba file và build giao diện được chạy lại trên bản cuối. Backend/helper/migration/harness/test không thay đổi giữa hai mốc.

## Manifest SHA256 đối chiếu cuối

| File | SHA256 |
|---|---|
| `server/index.ts` | `66F7DDABFC23E4EFBA55B33FD2454C8AE8DC16E22B577390D6FB5828584150BB` |
| `server/payroll-approval-history.ts` | `BA506BAF196E27F82E1AC31A00C15712A5D7F1DE979FBCBE7C7F373F8C66D68F` |
| `server/payroll-bundle-approval.ts` | `5843798BE5156970977CB3459CF1CB13AFB5722911FD7E97874AA404AEFC9100` |
| `server/db/migrations/055_local_payroll_approval_continuations.sql` | `674B524D12469360F4905A41B93451A124849E8DC4DBE95B5049BC6F905CB0B8` |
| `src/pages/MyAttendancePage.tsx` | `FEDFD4E1774DAA7B49F33D36237E59663FCA39CF007C658DB9B3E6269A785CD4` |
| `src/pages/PayrollSettingsPage.tsx` | `507E476BA228AD34E466D03DFED53984BCF96A1B739B2AB951BA7FE9728D4040` |
| `src/components/AttendanceWorkspaceV2.tsx` | `D5EE0D6FABCAB5C9A610B7513C206086837B821C366710529A5EC6A208ED1673` |
| `scripts/test-payroll-integrity-isolated.mjs` | `FC59BE6D19E7B32F28510002E9A69DE0B85EC643BA7ECA4332A16B15E2DD4EF5` |
| `scripts/test-payroll-flow-optimization-isolated.mjs` | `66290882AAAB816EE088D645C06A2E87952A491A9C3F266D4581B94964CFE29B` |

## Giới hạn

Không chạy lại kiểm thử thao tác UI bằng trình duyệt trong lượt này do công cụ trình duyệt đã bị policy chặn ở lượt trước. Thay đổi chống kết quả tải sai thứ tự, readiness và ngữ cảnh gửi được kiểm tra TypeScript/lint/build và review mã; chưa được xác nhận bằng thao tác tương tác UI. Không đo hiệu năng với dữ liệu lớn và không kiểm thử gửi tiền ngân hàng thực tế.
